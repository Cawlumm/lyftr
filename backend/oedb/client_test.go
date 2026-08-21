package oedb

import (
	"compress/gzip"
	"context"
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

// oedb rejects more than 100 ids per request outright, so the batching has to
// respect that boundary rather than discover it. Getting this wrong loses the
// tail of a refresh silently — rows that simply never update.
func TestListByIDs_BatchesAtTheCap(t *testing.T) {
	var requests []struct {
		ids     []string
		perPage string
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("ids") == "" {
			t.Errorf("request without ids: %s", r.URL)
		}
		ids := strings.Split(q.Get("ids"), ",")
		if len(ids) > 100 {
			// Mirror oedb: over the cap is a rejection, not a truncation.
			w.WriteHeader(http.StatusUnprocessableEntity)
			return
		}
		requests = append(requests, struct {
			ids     []string
			perPage string
		}{ids, q.Get("per_page")})

		items := make([]string, 0, len(ids))
		for _, id := range ids {
			items = append(items, fmt.Sprintf(
				`{"id":%q,"slug":"ex","translation":{"name":"Exercise %s","instructions":[]}}`, id, id))
		}
		fmt.Fprintf(w, `{"exercises":[%s],"total":%d,"page":1,"per_page":%d}`,
			strings.Join(items, ","), len(items), len(items))
	}))
	defer srv.Close()

	ids := make([]string, 250)
	for i := range ids {
		ids[i] = fmt.Sprintf("uuid-%03d", i)
	}

	got, err := New(srv.URL, "test").ListByIDs(context.Background(), ids)
	if err != nil {
		t.Fatalf("list by ids: %v", err)
	}
	if len(got) != 250 {
		t.Fatalf("got %d exercises, want 250 — a batch was lost", len(got))
	}
	if len(requests) != 3 {
		t.Fatalf("made %d requests, want 3 batches of at most 100", len(requests))
	}
	for i, req := range requests {
		if len(req.ids) > 100 {
			t.Errorf("batch %d had %d ids, over the cap", i, len(req.ids))
		}
		// per_page must cover the batch or the response is paginated and the
		// tail goes missing without an error.
		if req.perPage != fmt.Sprint(len(req.ids)) {
			t.Errorf("batch %d: per_page=%s for %d ids", i, req.perPage, len(req.ids))
		}
	}
}

func TestListByIDs_EmptyMakesNoRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected request for an empty id set: %s", r.URL)
	}))
	defer srv.Close()

	got, err := New(srv.URL, "test").ListByIDs(context.Background(), nil)
	if err != nil || len(got) != 0 {
		t.Fatalf("got %v, %v; want no rows and no error", got, err)
	}
}
