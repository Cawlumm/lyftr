package oedb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeSnap struct {
	t        *testing.T
	mu       sync.Mutex
	manifest map[string]any
	files    map[string][]byte
	reqs     []string
	uas      []string
	etag     string
}

func fakeExercise(id, name string) Exercise {
	return Exercise{ID: id, Slug: id, Translation: Translation{Name: name}}
}

func fileBody(items []Exercise, total int) []byte {
	b, _ := json.Marshal(map[string]any{"exercises": items, "total": total})
	return b
}

func newFakeSnap(t *testing.T, locales map[string][]Exercise) *fakeSnap {
	f := &fakeSnap{t: t, files: map[string][]byte{}, etag: `"m1"`}
	var ls []map[string]any
	for code, items := range locales {
		body := fileBody(items, len(items))
		sum := sha256.Sum256(body)
		h := hex.EncodeToString(sum[:])
		name := "exercises." + code + "." + h[:16] + ".json"
		f.files["/v1/"+name] = body
		ls = append(ls, map[string]any{"code": code, "file": name, "total": len(items), "sha256": h})
	}
	f.manifest = map[string]any{"schema_version": 1, "generated_at": time.Now().UTC().Format(time.RFC3339), "source": "https://api.example", "locales": ls}
	return f
}

func (f *fakeSnap) server() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.reqs = append(f.reqs, r.URL.Path)
		f.uas = append(f.uas, r.Header.Get("User-Agent"))
		w.Header().Set("Content-Type", "text/plain")
		if r.URL.Path == "/v1/manifest.json" {
			if r.Header.Get("If-None-Match") == f.etag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
			w.Header().Set("ETag", f.etag)
			_ = json.NewEncoder(w).Encode(f.manifest)
			return
		}
		b, ok := f.files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(b)
	}))
}

func (f *fakeSnap) count(suffix string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, p := range f.reqs {
		if strings.HasSuffix(p, suffix) {
			n++
		}
	}
	return n
}

func twoLocales() map[string][]Exercise {
	return map[string][]Exercise{
		"en": {fakeExercise("a", "Squat"), fakeExercise("b", "Bench")},
		"es": {fakeExercise("a", "Sentadilla")},
	}
}

func TestSnapshotLoad_Valid(t *testing.T) {
	f := newFakeSnap(t, twoLocales())
	srv := f.server()
	defer srv.Close()
	s := NewSnapshot([]string{srv.URL + "/v1/"}, "test")
	got, err := s.Load(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Exercises["en"]) != 2 || len(got.Exercises["es"]) != 1 || got.Source != "https://api.example" || got.URL != srv.URL+"/v1" {
		t.Fatalf("unexpected load: %+v", got)
	}
	if len(got.Locales) != 2 {
		t.Fatalf("locales = %v", got.Locales)
	}
	for _, ua := range f.uas {
		if !strings.HasPrefix(ua, "lyftr/test (+https://github.com/Cawlumm/lyftr)") {
			t.Errorf("user agent %q", ua)
		}
	}
}

func TestSnapshotLoad_SecondLoadIsConditionalAndReusesFiles(t *testing.T) {
	f := newFakeSnap(t, twoLocales())
	srv := f.server()
	defer srv.Close()
	s := NewSnapshot([]string{srv.URL + "/v1"}, "test")
	for i := 0; i < 2; i++ {
		got, err := s.Load(context.Background(), nil)
		if err != nil || len(got.Exercises["en"]) != 2 {
			t.Fatalf("load %d: %v %+v", i, err, got)
		}
	}
	if n := f.count("manifest.json"); n != 2 {
		t.Errorf("manifest requests = %d, want 2 (second conditional)", n)
	}
	if n := f.count(".json") - f.count("manifest.json"); n != 2 {
		t.Errorf("data file requests = %d, want 2 (cached by name after the first load)", n)
	}
}

func TestSnapshotLoad_AcceptUnchangedFetchesNoFiles(t *testing.T) {
	f := newFakeSnap(t, twoLocales())
	srv := f.server()
	defer srv.Close()
	s := NewSnapshot([]string{srv.URL + "/v1"}, "test")
	got, err := s.Load(context.Background(), func(Manifest) error { return ErrSnapshotUnchanged })
	if err != nil || !got.Unchanged || got.Exercises != nil {
		t.Fatalf("got %+v, %v", got, err)
	}
	if n := f.count(".json") - f.count("manifest.json"); n != 0 {
		t.Errorf("data files fetched: %d", n)
	}
}

func TestSnapshotLoad_RejectsAndFallsThrough(t *testing.T) {
	good := newFakeSnap(t, twoLocales())
	goodSrv := good.server()
	defer goodSrv.Close()

	big := strings.Repeat("x", 600)
	cases := map[string]func(f *fakeSnap){
		"schema_version 2": func(f *fakeSnap) { f.manifest["schema_version"] = 2 },
		"no en": func(f *fakeSnap) {
			f.manifest["locales"] = f.manifest["locales"].([]map[string]any)[:0]
		},
		"sha mismatch": func(f *fakeSnap) {
			for _, l := range f.manifest["locales"].([]map[string]any) {
				l["sha256"] = strings.Repeat("0", 64)
			}
		},
		"total mismatch": func(f *fakeSnap) {
			for _, l := range f.manifest["locales"].([]map[string]any) {
				l["total"] = 99
			}
		},
		"unsafe file name": func(f *fakeSnap) {
			f.manifest["locales"].([]map[string]any)[0]["file"] = "../x.json"
		},
		"slash in file name": func(f *fakeSnap) {
			f.manifest["locales"].([]map[string]any)[0]["file"] = "a/b.json"
		},
		"bad locale code": func(f *fakeSnap) {
			f.manifest["locales"].([]map[string]any)[0]["code"] = "e n!"
		},
		"duplicate locale": func(f *fakeSnap) {
			ls := f.manifest["locales"].([]map[string]any)
			f.manifest["locales"] = append(ls, ls[0])
		},
		"oversize": func(f *fakeSnap) {
			for p := range f.files {
				f.files[p] = []byte(big)
			}
		},
		"missing file": func(f *fakeSnap) { f.files = map[string][]byte{} },
		"not json":     func(f *fakeSnap) { f.manifest = nil },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			bad := newFakeSnap(t, twoLocales())
			mutate(bad)
			badSrv := bad.server()
			defer badSrv.Close()
			old := MaxSnapshotBody
			if name == "oversize" {
				MaxSnapshotBody = 500
			}
			defer func() { MaxSnapshotBody = old }()

			only := NewSnapshot([]string{badSrv.URL + "/v1"}, "t")
			if _, err := only.Load(context.Background(), nil); err == nil {
				t.Fatal("bad snapshot loaded")
			} else if !strings.Contains(err.Error(), badSrv.URL) {
				t.Errorf("error does not name the source: %v", err)
			}
			if name == "oversize" {
				MaxSnapshotBody = old // the good source is small
			}
			both := NewSnapshot([]string{badSrv.URL + "/v1", goodSrv.URL + "/v1"}, "t")
			got, err := both.Load(context.Background(), nil)
			if err != nil || got.URL != goodSrv.URL+"/v1" {
				t.Fatalf("second source not used: %+v %v", got, err)
			}
		})
	}
}

func TestSnapshotLoad_IDRules(t *testing.T) {
	cases := map[string]map[string][]Exercise{
		"duplicate en id": {"en": {fakeExercise("a", "A"), fakeExercise("a", "B")}},
		"non-en id not in en": {
			"en": {fakeExercise("a", "A")},
			"es": {fakeExercise("zzz", "Z")},
		},
		"empty id": {"en": {fakeExercise("", "A")}},
	}
	for name, locales := range cases {
		t.Run(name, func(t *testing.T) {
			f := newFakeSnap(t, locales)
			srv := f.server()
			defer srv.Close()
			if _, err := NewSnapshot([]string{srv.URL + "/v1"}, "t").Load(context.Background(), nil); err == nil {
				t.Fatal("loaded")
			}
		})
	}
}

func TestSnapshotLoad_AcceptErrorRejectsSource(t *testing.T) {
	f := newFakeSnap(t, twoLocales())
	srv := f.server()
	defer srv.Close()
	_, err := NewSnapshot([]string{srv.URL + "/v1"}, "t").Load(context.Background(), func(Manifest) error { return errors.New("too old") })
	if err == nil || !strings.Contains(err.Error(), "too old") {
		t.Fatalf("err = %v", err)
	}
}

func TestSnapshotLoad_ListsEveryFailure(t *testing.T) {
	a := httptest.NewServer(http.NotFoundHandler())
	defer a.Close()
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer b.Close()
	_, err := NewSnapshot([]string{a.URL, b.URL}, "t").Load(context.Background(), nil)
	if err == nil || !strings.Contains(err.Error(), "http 404") || !strings.Contains(err.Error(), "http 500") {
		t.Fatalf("err = %v", err)
	}
}

func TestSnapshotLoad_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := NewSnapshot([]string{srv.URL}, "t").Load(ctx, nil); err == nil {
		t.Fatal("expected a timeout")
	}
}

func TestManifest_PublishedFallsBackToGeneratedAt(t *testing.T) {
	g := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if got := (Manifest{GeneratedAt: g}).Published(); !got.Equal(g) {
		t.Errorf("Published = %v, want generated_at", got)
	}
	p := g.Add(time.Hour)
	if got := (Manifest{GeneratedAt: g, PublishedAt: &p}).Published(); !got.Equal(p) {
		t.Errorf("Published = %v, want published_at", got)
	}
}
