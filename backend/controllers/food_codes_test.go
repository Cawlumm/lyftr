package controllers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/oedb"
)

// These pin the code, the status and the sentence of every error the food-database and
// exercise-catalog paths can answer with, so a client can word each one itself.

func wantCode(t *testing.T, w *httptest.ResponseRecorder, status int, code, sentence string) map[string]any {
	t.Helper()
	body := decodeResponse(t, w)
	if w.Code != status || body["code"] != code || body["error"] != sentence {
		t.Fatalf("got %d %v, want %d %s %q", w.Code, body, status, code, sentence)
	}
	return body
}

type failingTransport struct{}

func (failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("dial tcp: connection refused")
}

func TestLookupBarcode_productNotFoundCode(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"failure","product":{}}`))
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/012345678901", nil)
	setParam(c, "code", "012345678901")
	th.LookupBarcode(c)

	wantCode(t, w, http.StatusNotFound, "PRODUCT_NOT_FOUND", "No product matched that barcode.")
}

func TestLookupBarcode_invalidBarcodeCode(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	for _, code := range []string{"abc", " ", "12345"} {
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/"+code, nil)
		setParam(c, "code", code)
		th.LookupBarcode(c)
		wantCode(t, w, http.StatusBadRequest, "INVALID_BARCODE", "That barcode isn't valid.")
	}
}

func TestSearchFood_failureCodes(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	t.Run("missing term", func(t *testing.T) {
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/search", nil)
		th.SearchFood(c)
		wantCode(t, w, http.StatusBadRequest, "SEARCH_TERM_REQUIRED", "A search term is required.")
	})

	t.Run("upstream 5xx", func(t *testing.T) {
		withOFFMock(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=pizza", nil)
		th.SearchFood(c)
		wantCode(t, w, http.StatusServiceUnavailable, "FOOD_SEARCH_UNAVAILABLE", "Food search is temporarily unavailable.")
		if w.Header().Get("Retry-After") != "2" {
			t.Errorf("Retry-After = %q, want 2", w.Header().Get("Retry-After"))
		}
	})

	t.Run("unreachable", func(t *testing.T) {
		prev := offClient
		offClient = &http.Client{Transport: failingTransport{}, Timeout: 5 * time.Second}
		t.Cleanup(func() { offClient = prev })
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=pizza", nil)
		th.SearchFood(c)
		wantCode(t, w, http.StatusServiceUnavailable, "FOOD_DATABASE_UNREACHABLE", "Couldn't reach the food database.")
	})

	t.Run("timeout", func(t *testing.T) {
		withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {})
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=pizza", nil)
		expired, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
		defer cancel()
		c.Request = c.Request.WithContext(expired)
		th.SearchFood(c)
		wantCode(t, w, http.StatusServiceUnavailable, "FOOD_DATABASE_TIMEOUT", "The food database didn't respond in time. Try again.")
		if w.Header().Get("Retry-After") != "2" {
			t.Errorf("Retry-After = %q, want 2", w.Header().Get("Retry-After"))
		}
	})
}

func TestLookupBarcode_failureCodes(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	lookup := func() *httptest.ResponseRecorder {
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/012345678901", nil)
		setParam(c, "code", "012345678901")
		th.LookupBarcode(c)
		return w
	}

	t.Run("upstream 5xx", func(t *testing.T) {
		withOFFMock(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadGateway) })
		wantCode(t, lookup(), http.StatusServiceUnavailable, "BARCODE_LOOKUP_UNAVAILABLE", "Barcode lookup is temporarily unavailable.")
	})

	t.Run("unreachable", func(t *testing.T) {
		prev := offClient
		offClient = &http.Client{Transport: failingTransport{}, Timeout: 5 * time.Second}
		t.Cleanup(func() { offClient = prev })
		wantCode(t, lookup(), http.StatusServiceUnavailable, "FOOD_DATABASE_UNREACHABLE", "Couldn't reach the food database.")
	})
}

func TestLogFood_lengthLimitCodes(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	cases := []struct {
		field, code, sentence string
		max                   int
	}{
		{"name", "FOOD_NAME_TOO_LONG", "Name must be 200 characters or fewer.", 200},
		{"brand", "FOOD_BRAND_TOO_LONG", "Brand must be 200 characters or fewer.", 200},
		{"serving_size", "SERVING_SIZE_TOO_LONG", "Serving size must be 100 characters or fewer.", 100},
		{"barcode", "BARCODE_TOO_LONG", "Barcode must be 50 characters or fewer.", 50},
		{"image_url", "IMAGE_URL_TOO_LONG", "Image URL must be 500 characters or fewer.", 500},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			body := map[string]any{"name": "Test", "meal": "dinner"}
			body[tc.field] = strings.Repeat("1", tc.max+1)
			c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
			th.LogFood(c)
			got := wantCode(t, w, http.StatusBadRequest, tc.code, tc.sentence)
			if p, _ := got["params"].(map[string]any); p["max"] != float64(tc.max) {
				t.Errorf("params = %v, want max %d", got["params"], tc.max)
			}
		})
	}
}

func TestRefreshExerciseCache_withoutCatalogCode(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodPost, "/api/v1/admin/sync-exercises", nil)
	th.RefreshExerciseCache(c)

	wantCode(t, w, http.StatusBadRequest, "NO_EXERCISE_CATALOG", "This server has no exercise catalog configured.")
}

func refreshWithCatalog(t *testing.T, baseURL string) *httptest.ResponseRecorder {
	t.Helper()
	setupTestDB(t)
	uid := createTestUser(t)
	if _, err := db.DB.Exec("INSERT INTO exercises (name, oedb_id) VALUES ('Held', 'uuid-1')"); err != nil {
		t.Fatal(err)
	}
	th.s.Exercise.UseCatalog(oedb.New(baseURL, "test"))

	c, w := newContext(uid, http.MethodPost, "/api/v1/admin/sync-exercises", nil)
	th.RefreshExerciseCache(c)
	return w
}

func TestRefreshExerciseCache_catalogFailureCodes(t *testing.T) {
	const sentence = "Couldn't reach the exercise catalog."

	t.Run("upstream 5xx", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer srv.Close()
		w := refreshWithCatalog(t, srv.URL)
		wantCode(t, w, http.StatusServiceUnavailable, "EXERCISE_CATALOG_UNREACHABLE", sentence)
		if got := w.Header().Get("Retry-After"); got != "2" {
			t.Fatalf("Retry-After = %q, want 2", got)
		}
	})

	t.Run("unreachable", func(t *testing.T) {
		w := refreshWithCatalog(t, "http://127.0.0.1:1")
		wantCode(t, w, http.StatusServiceUnavailable, "EXERCISE_CATALOG_UNREACHABLE", sentence)
	})

	t.Run("malformed body", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("{not json"))
		}))
		defer srv.Close()
		w := refreshWithCatalog(t, srv.URL)
		wantCode(t, w, http.StatusServiceUnavailable, "EXERCISE_CATALOG_UNREACHABLE", sentence)
	})
}

func TestRefreshExerciseCache_success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"exercises":[{"id":"uuid-1","slug":"held","muscle_group":"chest","translation":{"name":"Held Renamed","instructions":[]}}],"total":1}`))
	}))
	defer srv.Close()
	w := refreshWithCatalog(t, srv.URL)

	body := decodeResponse(t, w)
	data, _ := body["data"].(map[string]any)
	if w.Code != http.StatusOK || data["refreshed"] != float64(1) || body["code"] != nil {
		t.Fatalf("got %d %v, want 200 refreshed 1", w.Code, body)
	}
}
