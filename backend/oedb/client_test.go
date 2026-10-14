package oedb

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// listBody is a minimal but structurally real oedb list response.
func listBody(name string) string {
	return fmt.Sprintf(`{"exercises":[{"id":"uuid-1","slug":"bench-press","muscle_group":"chest",
		"secondary_muscles":["triceps"],"category":"strength","equipment":"barbell",
		"images":[{"id":"img-1","url":"/api/v1/images/img-1"}],
		"translation":{"name":%q,"instructions":["Step one.","Step two."]}}],
		"total":1,"page":1,"per_page":100}`, name)
}

// A response still inside max-age must be served from memory without touching
// the network. This is the whole economic argument for querying oedb live rather
// than mirroring it: a popular search costs one upstream request per max-age
// window no matter how many users run it.
func TestGet_FreshResponseIsServedFromCache(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
		w.Header().Set("ETag", `"v1"`)
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()

	c := New(srv.URL, "test")
	for i := 0; i < 3; i++ {
		if _, err := c.List(context.Background(), ListParams{}); err != nil {
			t.Fatalf("list %d: %v", i, err)
		}
	}
	if got := atomic.LoadInt32(&hits); got != 1 {
		t.Errorf("upstream hits = %d, want 1 (cache did not hold)", got)
	}
}

// A revalidation that returns 304 carries no body, so the cached one must be
// reused. Getting this wrong is not a performance bug — it returns an empty
// exercise list to the caller.
func TestGet_304ReusesCachedBody(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.Header().Set("Cache-Control", "public, max-age=300")
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=0")
		w.Header().Set("ETag", `"v1"`)
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()

	c := New(srv.URL, "test")
	if _, err := c.List(context.Background(), ListParams{}); err != nil {
		t.Fatalf("first list: %v", err)
	}
	// max-age=0 leaves the entry immediately stale with no stale-while-revalidate
	// window, so the second call revalidates synchronously and gets a 304.
	res, err := c.List(context.Background(), ListParams{})
	if err != nil {
		t.Fatalf("second list: %v", err)
	}
	if len(res.Exercises) != 1 {
		t.Fatalf("got %d exercises after 304, want 1 — the cached body was lost", len(res.Exercises))
	}
	if got := atomic.LoadInt32(&hits); got != 2 {
		t.Errorf("upstream hits = %d, want 2", got)
	}
}

// Past max-age but inside stale-while-revalidate, the caller must be served
// immediately from the stale copy rather than waiting on the network.
func TestGet_ServesStaleWhileRevalidating(t *testing.T) {
	var hits int32
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&hits, 1) > 1 {
			<-release // hold the revalidation open so a slow refresh is unmistakable
		}
		w.Header().Set("Cache-Control", "public, max-age=0, stale-while-revalidate=86400")
		w.Header().Set("ETag", `"v1"`)
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()
	defer close(release)

	c := New(srv.URL, "test")
	if _, err := c.List(context.Background(), ListParams{}); err != nil {
		t.Fatalf("first list: %v", err)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		res, err := c.List(context.Background(), ListParams{})
		if err != nil {
			t.Errorf("stale list: %v", err)
			return
		}
		if len(res.Exercises) != 1 {
			t.Errorf("got %d exercises, want the stale copy", len(res.Exercises))
		}
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stale read blocked on the background revalidation")
	}
}

// oedb tiers rate limits on caller identity: an unidentified client gets 5
// requests/minute instead of 60. A request that forgets to say who it is works
// in testing and 429s in production.
func TestFetch_SendsIdentifyingUserAgent(t *testing.T) {
	got := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case got <- r.Header.Get("User-Agent"):
		default:
		}
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()

	c := New(srv.URL, "1.2.3")
	if _, err := c.List(context.Background(), ListParams{}); err != nil {
		t.Fatalf("list: %v", err)
	}
	ua := <-got
	if !strings.HasPrefix(ua, "lyftr/1.2.3 ") || !strings.Contains(ua, "github.com/Cawlumm/lyftr") {
		t.Errorf("User-Agent = %q, want an identifying lyftr agent with a contact URL", ua)
	}
}

// A 404 must be distinguishable from an outage: the first is a client error, the
// second is the signal to fall back to the local snapshot.
func TestGet_404IsErrNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := New(srv.URL, "test").Get(context.Background(), "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// per_page above 100 is a 422 from oedb, not a clamp, so the client must clamp
// before asking.
func TestListParams_ClampsPerPage(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"1000", "100"},
		{"0", "100"},
	} {
		v := ListParams{PerPage: atoiOrZero(tc.in)}.query()
		if got := v.Get("per_page"); got != tc.want {
			t.Errorf("per_page for %s = %s, want %s", tc.in, got, tc.want)
		}
	}
}

func atoiOrZero(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func TestCacheWindow(t *testing.T) {
	tests := []struct {
		header      string
		fresh, stal time.Duration
	}{
		{"public, max-age=300, stale-while-revalidate=86400", 300 * time.Second, 86400 * time.Second},
		{"public, max-age=900", 900 * time.Second, 0},
		{"", 60 * time.Second, 0},
		{"no-cache", 60 * time.Second, 0},
		{"max-age=abc", 60 * time.Second, 0},
	}
	for _, tc := range tests {
		fresh, stale := cacheWindow(tc.header)
		if fresh != tc.fresh || stale != tc.stal {
			t.Errorf("cacheWindow(%q) = %v/%v, want %v/%v", tc.header, fresh, stale, tc.fresh, tc.stal)
		}
	}
}

func TestExercise_DescriptionAndImageURL(t *testing.T) {
	e := Exercise{
		Images:      []Image{{URL: "/api/v1/images/img-1"}},
		Translation: Translation{Instructions: []string{"One.", "Two."}},
	}
	if got := e.Description(); got != "1. One.\n2. Two." {
		t.Errorf("Description() = %q", got)
	}
	if got := e.ImageURL("https://oedb.test/"); got != "https://oedb.test/api/v1/images/img-1" {
		t.Errorf("ImageURL() = %q", got)
	}
	if got := (Exercise{}).ImageURL("https://oedb.test"); got != "" {
		t.Errorf("ImageURL() with no images = %q, want empty", got)
	}
	absolute := Exercise{Images: []Image{{URL: "https://cdn.test/x.jpg"}}}
	if got := absolute.ImageURL("https://oedb.test"); got != "https://cdn.test/x.jpg" {
		t.Errorf("ImageURL() rewrote an already-absolute URL: %q", got)
	}
}

// oedb compresses its responses, and the export endpoint in particular is ~300 KB
// uncompressed. net/http negotiates and decompresses gzip transparently only
// while it owns the Accept-Encoding header — setting that header by hand opts out
// of the decompression too, and the body arrives as raw gzip that fails to decode
// with "invalid character '\x1f'". Unit tests over an uncompressed test server
// cannot see that, so this one compresses.
func TestFetch_TransparentlyDecompressesGzip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			t.Errorf("Accept-Encoding = %q, want gzip offered", r.Header.Get("Accept-Encoding"))
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		zw := gzip.NewWriter(w)
		defer zw.Close()
		fmt.Fprint(zw, listBody("Bench Press"))
	}))
	defer srv.Close()

	res, err := New(srv.URL, "test").List(context.Background(), ListParams{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Exercises) != 1 || res.Exercises[0].Name() != "Bench Press" {
		t.Fatalf("got %+v, want one decoded exercise", res.Exercises)
	}
}

// Page must be sent for anything past the first, and omitted for it — oedb
// defaults to page 1, and sending page=1 explicitly is noise in the cache key.
func TestListParams_PagingAndFilters(t *testing.T) {
	v := ListParams{Query: " squat ", Equipment: "dumbbell", Page: 3, PerPage: 25}.query()
	if got := v.Get("q"); got != "squat" {
		t.Errorf("q = %q, want trimmed", got)
	}
	if got := v.Get("equipment"); got != "dumbbell" {
		t.Errorf("equipment = %q", got)
	}
	if got := v.Get("page"); got != "3" {
		t.Errorf("page = %q, want 3", got)
	}
	if got := v.Get("per_page"); got != "25" {
		t.Errorf("per_page = %q, want 25", got)
	}
	if got := (ListParams{Page: 1}).query().Get("page"); got != "" {
		t.Errorf("page for page 1 = %q, want omitted", got)
	}
	if got := (ListParams{}).query().Get("muscle_group"); got != "" {
		t.Errorf("empty filter was sent: %q", got)
	}
}

// oedb's search tier permits 60 requests a minute but a much smaller burst, so a
// client issuing a short run of legitimate queries trips 429 while well inside
// its per-minute budget. Retrying on the server's own Retry-After turns that into
// a pause instead of a failure.
func TestFetch_RetriesAfter429(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&hits, 1) == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			fmt.Fprint(w, `{"detail":"rate limit exceeded"}`)
			return
		}
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()

	res, err := New(srv.URL, "test").List(context.Background(), ListParams{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(res.Exercises) != 1 {
		t.Fatalf("got %d exercises, want 1", len(res.Exercises))
	}
	if got := atomic.LoadInt32(&hits); got != 2 {
		t.Errorf("upstream hits = %d, want 2 (one 429 then one success)", got)
	}
}

// A persistent 429 must surface rather than retry forever — at that point the
// per-minute budget is genuinely spent and the caller should fall back.
func TestFetch_GivesUpOnPersistent429(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	_, err := New(srv.URL, "test").List(context.Background(), ListParams{})
	if err == nil {
		t.Fatal("want an error after exhausting retries")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Errorf("err = %v, want it to name the 429", err)
	}
	if got := atomic.LoadInt32(&hits); got != maxRateLimitRetries+1 {
		t.Errorf("upstream hits = %d, want %d", got, maxRateLimitRetries+1)
	}
}

func TestRetryAfter(t *testing.T) {
	if _, ok := retryAfter("Wed, 21 Oct 2015 07:28:00 GMT"); ok {
		t.Error("HTTP-date Retry-After was accepted; it must be rejected, not guessed")
	}
	if _, ok := retryAfter(""); ok {
		t.Error("empty Retry-After was accepted")
	}
	if _, ok := retryAfter("600"); ok {
		t.Error("an implausibly long Retry-After was accepted")
	}
	d, ok := retryAfter("2")
	if !ok || d < 2*time.Second {
		t.Errorf("retryAfter(\"2\") = %v, %v", d, ok)
	}
}

func TestListParams_LocaleAndIDsInURL(t *testing.T) {
	q := ListParams{Locale: "es", IDs: []string{"a", "b"}}.query()
	if q.Get("locale") != "es" {
		t.Errorf("locale = %q, want es", q.Get("locale"))
	}
	if q.Get("ids") != "a,b" {
		t.Errorf("ids = %q, want a,b", q.Get("ids"))
	}

	q = ListParams{}.query()
	if q.Has("locale") || q.Has("ids") {
		t.Errorf("zero params leaked a locale or ids: %v", q)
	}
}

// The cache is one process-wide map keyed by path, so the locale has to be in the
// path. A header would let a Spanish answer be served to an English reader.
func TestGet_LocaleIsPartOfTheCacheKey(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Cache-Control", "public, max-age=300")
		name := "Squat"
		if r.URL.Query().Get("locale") == "es" {
			name = "Sentadilla"
		}
		fmt.Fprint(w, listBody(name))
	}))
	defer srv.Close()

	c := New(srv.URL, "test")
	for _, tc := range []struct{ locale, want string }{{"es", "Sentadilla"}, {"", "Squat"}, {"es", "Sentadilla"}, {"", "Squat"}} {
		res, err := c.List(context.Background(), ListParams{Locale: tc.locale})
		if err != nil {
			t.Fatal(err)
		}
		if got := res.Exercises[0].Name(); got != tc.want {
			t.Errorf("locale %q served %q, want %q", tc.locale, got, tc.want)
		}
	}
	if got := atomic.LoadInt32(&hits); got != 2 {
		t.Errorf("upstream hits = %d, want 2 (one per locale, then both cached)", got)
	}
}

func TestTranslation_DecodesServedLocalesAndMachineFlags(t *testing.T) {
	var out ListResult
	body := `{"exercises":[{"id":"u","translation":{"name":"Sentadilla","name_locale":"es","name_machine_origin":true,
		"instructions":["x"],"instructions_locale":"en","instructions_machine_origin":false}}]}`
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatal(err)
	}
	tr := out.Exercises[0].Translation
	if tr.NameLocale != "es" || !tr.NameMachineOrigin || tr.InstructionsLocale != "en" || tr.InstructionsMachineOrigin {
		t.Errorf("decoded %+v", tr)
	}
}

func TestLocales_WalksEveryPage(t *testing.T) {
	var agents []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("per_page") != "100" {
			t.Errorf("per_page = %q, want 100", r.URL.Query().Get("per_page"))
		}
		agents = append(agents, r.UserAgent())
		w.Header().Set("Cache-Control", "max-age=0")
		if r.URL.Query().Get("page") == "1" {
			fmt.Fprint(w, `{"locales":[{"code":"en"},{"code":"es"}],"total":3}`)
			return
		}
		fmt.Fprint(w, `{"locales":[{"code":"pt"}],"total":3}`)
	}))
	defer srv.Close()

	got, err := New(srv.URL, "test").Locales(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got, ",") != "en,es,pt" {
		t.Errorf("Locales = %v, want [en es pt]", got)
	}
	if len(agents) != 2 {
		t.Fatalf("requests = %d, want 2", len(agents))
	}
	for _, ua := range agents {
		if !strings.Contains(ua, "test") {
			t.Errorf("User-Agent %q does not identify the client", ua)
		}
	}
}

func TestLocales_PropagatesErrors(t *testing.T) {
	status := http.StatusInternalServerError
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "x", status)
	}))
	defer srv.Close()

	c := New(srv.URL, "test")
	if _, err := c.Locales(context.Background()); err == nil {
		t.Error("500: want an error")
	}
	status = http.StatusNotFound
	c = New(srv.URL, "test")
	if _, err := c.Locales(context.Background()); !errors.Is(err, ErrNotFound) {
		t.Errorf("404: err = %v, want ErrNotFound", err)
	}
}

func TestRevalidating_SendsAConditionalGetEvenWhenFresh(t *testing.T) {
	var hits, bodies int32
	var secondINM atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&hits, 1)
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
		w.Header().Set("ETag", `"v1"`)
		if n == 2 {
			secondINM.Store(r.Header.Get("If-None-Match"))
		}
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		atomic.AddInt32(&bodies, 1)
		fmt.Fprint(w, listBody("Bench Press"))
	}))
	defer srv.Close()

	v := New(srv.URL, "test").Revalidating()
	for i := 0; i < 2; i++ {
		res, err := v.List(context.Background(), ListParams{})
		if err != nil {
			t.Fatalf("list %d: %v", i, err)
		}
		if len(res.Exercises) != 1 {
			t.Fatalf("list %d: %d exercises, want 1", i, len(res.Exercises))
		}
	}
	if got := atomic.LoadInt32(&hits); got != 2 {
		t.Errorf("hits = %d, want 2: a fresh entry must still be revalidated", got)
	}
	if got, _ := secondINM.Load().(string); got != `"v1"` {
		t.Errorf("second If-None-Match = %q, want \"v1\"", got)
	}
	if got := atomic.LoadInt32(&bodies); got != 1 {
		t.Errorf("full bodies served = %d, want 1", got)
	}
}

func TestRevalidating_SharesTheCacheButInteractiveReadsStillServeStale(t *testing.T) {
	var hits int32
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&hits, 1)
		if n >= 3 {
			<-release
		}
		v := "v1"
		if n >= 2 {
			v = "v2"
		}
		w.Header().Set("Cache-Control", "public, max-age=0, stale-while-revalidate=86400")
		w.Header().Set("ETag", `"`+v+`"`)
		fmt.Fprint(w, listBody(v))
	}))
	defer srv.Close()
	defer close(release)

	c := New(srv.URL, "test")
	first, err := c.List(context.Background(), ListParams{})
	if err != nil || first.Exercises[0].Name() != "v1" {
		t.Fatalf("prime: %v %+v", err, first)
	}
	second, err := c.Revalidating().List(context.Background(), ListParams{})
	if err != nil || second.Exercises[0].Name() != "v2" {
		t.Fatalf("revalidating read must return the new body synchronously: %v %+v", err, second)
	}

	done := make(chan string, 1)
	go func() {
		res, err := c.List(context.Background(), ListParams{})
		if err != nil {
			done <- err.Error()
			return
		}
		done <- res.Exercises[0].Name()
	}()
	select {
	case got := <-done:
		if got != "v2" {
			t.Errorf("interactive read = %q, want the view's v2 from the shared cache", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("interactive read waited on the network instead of serving stale")
	}
	if got := atomic.LoadInt32(&hits); got > 3 {
		t.Errorf("hits = %d, want at most 2 synchronous plus 1 background", got)
	}
}

func TestLocales_BoundedAgainstHostileLists(t *testing.T) {
	cases := []struct {
		name     string
		total    int
		perPage  func(page int) int
		wantErr  bool
		wantHits int32
		wantLen  int
	}{
		{"endless one-per-page", 500, func(int) int { return 1 }, true, maxLocalePages, 0},
		{"absurd total", 1_000_000, func(int) int { return 1 }, true, 1, 0},
		{"oversized page", 1, func(int) int { return 501 }, true, 1, 0},
		{"exactly the cap", 500, func(int) int { return 100 }, false, 5, 500},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var hits int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				page := int(atomic.AddInt32(&hits, 1))
				type loc struct {
					Code string `json:"code"`
				}
				out := struct {
					Locales []loc `json:"locales"`
					Total   int   `json:"total"`
				}{Total: tc.total}
				for i := 0; i < tc.perPage(page); i++ {
					out.Locales = append(out.Locales, loc{fmt.Sprintf("l%d-%d", page, i)})
				}
				w.Header().Set("Cache-Control", "max-age=0")
				_ = json.NewEncoder(w).Encode(out)
			}))
			defer srv.Close()

			codes, err := New(srv.URL, "test").Locales(context.Background())
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if len(codes) != tc.wantLen {
				t.Errorf("codes = %d, want %d", len(codes), tc.wantLen)
			}
			if got := atomic.LoadInt32(&hits); got != tc.wantHits {
				t.Errorf("hits = %d, want %d", got, tc.wantHits)
			}
		})
	}
}
