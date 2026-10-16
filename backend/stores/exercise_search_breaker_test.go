package stores

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

// breakerCatalog is an oedb stand-in whose behaviour the test switches: hung accepts the
// connection and never answers (a stopped server would refuse instantly, which hides the
// whole class of bug), status answers that code at once, and otherwise it returns an
// empty page.
type breakerCatalog struct {
	hits   atomic.Int32
	hung   atomic.Bool
	status atomic.Int32
	srv    *httptest.Server
}

func newBreakerCatalog(t *testing.T) *breakerCatalog {
	t.Helper()
	c := &breakerCatalog{}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c.hits.Add(1)
		if c.hung.Load() {
			<-r.Context().Done()
			return
		}
		if code := int(c.status.Load()); code != 0 {
			w.WriteHeader(code)
			return
		}
		w.Write([]byte(`{"exercises":[],"total":0,"page":1,"per_page":25}`))
	}))
	t.Cleanup(c.srv.Close)
	return c
}

func breakerStore(t *testing.T, c *breakerCatalog) *ExerciseStore {
	t.Helper()
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(c.srv.URL, "test"))
	s.searchTimeout = 150 * time.Millisecond
	return s
}

// One dead catalog must cost one slow request, not one per keystroke. Before this, every
// search against a hung catalog waited out the whole timeout before falling back.
func TestSearch_HungCatalogIsAskedOnce(t *testing.T) {
	c := newBreakerCatalog(t)
	c.hung.Store(true)
	s := breakerStore(t, c)
	f := ExerciseFilter{Query: "squat", Limit: 25}

	start := time.Now()
	if _, err := s.Search(context.Background(), f); err != nil {
		t.Fatalf("first search: %v", err)
	}
	if took := time.Since(start); took < s.searchTimeout {
		t.Fatalf("first search took %v, expected to wait out the %v timeout", took, s.searchTimeout)
	}
	first := c.hits.Load()

	start = time.Now()
	for i := 0; i < 5; i++ {
		if _, err := s.Search(context.Background(), f); err != nil {
			t.Fatalf("later search: %v", err)
		}
	}
	if took := time.Since(start); took > s.searchTimeout/2 {
		t.Errorf("five searches while the catalog is down took %v, want them served locally at once", took)
	}
	if n := c.hits.Load(); n != first {
		t.Errorf("catalog was asked %d more times while backed off, want 0", n-first)
	}
}

// After the backoff the catalog is tried again, and one good answer ends it.
func TestSearch_RetriesAfterBackoffAndRecovers(t *testing.T) {
	c := newBreakerCatalog(t)
	c.hung.Store(true)
	s := breakerStore(t, c)
	f := ExerciseFilter{Query: "squat", Limit: 25}

	s.Search(context.Background(), f)
	if s.searchDownUntil.Load() == 0 {
		t.Fatal("a hung catalog did not back searches off")
	}

	c.hung.Store(false)
	s.searchDownUntil.Store(time.Now().Add(-time.Second).UnixNano())
	before := c.hits.Load()
	if _, err := s.Search(context.Background(), f); err != nil {
		t.Fatalf("search after backoff: %v", err)
	}
	if c.hits.Load() == before {
		t.Error("catalog was not asked again once the backoff had passed")
	}
	if s.searchDownUntil.Load() != 0 {
		t.Error("a good answer did not end the backoff")
	}
}

// Once the backoff has passed, one request probes the catalog and the rest keep to the
// local copy meanwhile, so a catalog that is still down is not hit by a crowd.
func TestSearchAllowed_OnlyOneCallerProbesAfterBackoff(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	if !s.searchAllowed() {
		t.Fatal("a store that never failed must allow live search")
	}
	s.searchDownUntil.Store(time.Now().Add(time.Minute).UnixNano())
	if s.searchAllowed() {
		t.Fatal("live search was allowed inside the backoff")
	}
	s.searchDownUntil.Store(time.Now().Add(-time.Second).UnixNano())
	if !s.searchAllowed() {
		t.Fatal("the first caller after the backoff must be allowed to probe")
	}
	if s.searchAllowed() {
		t.Error("a second caller probed while the first was still trying")
	}
}

// A caller that gives up says nothing about the catalog, and neither does a fast "no":
// the next search must still reach it.
func TestSearch_OnlyANonAnswerBacksOff(t *testing.T) {
	t.Run("caller cancelled", func(t *testing.T) {
		c := newBreakerCatalog(t)
		c.hung.Store(true)
		s := breakerStore(t, c)
		ctx, cancel := context.WithCancel(context.Background())
		go func() { time.Sleep(30 * time.Millisecond); cancel() }()
		s.Search(ctx, ExerciseFilter{Query: "squat", Limit: 25})
		if s.searchDownUntil.Load() != 0 {
			t.Error("a client abandoning its own request backed everyone else off")
		}
	})

	for _, code := range []int{http.StatusUnprocessableEntity, http.StatusBadGateway} {
		t.Run(http.StatusText(code), func(t *testing.T) {
			c := newBreakerCatalog(t)
			c.status.Store(int32(code))
			s := breakerStore(t, c)
			f := ExerciseFilter{Query: "squat", Limit: 25}
			s.Search(context.Background(), f)
			s.Search(context.Background(), f)
			if s.searchDownUntil.Load() != 0 {
				t.Errorf("an immediate %d backed searches off", code)
			}
			if n := c.hits.Load(); n != 2 {
				t.Errorf("catalog asked %d times for two searches, want 2", n)
			}
		})
	}
}
