package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestChangeEmailRequiresAuth(t *testing.T) {
	// A real database rather than a nil store: Auth reads the account on a valid token, so a
	// future case in this file that sent one would panic on a nil pool and take the binary down.
	a := newAPI(t)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/me/email", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != "You need to sign in to do that." {
		t.Errorf("error = %v", body["error"])
	}
}
