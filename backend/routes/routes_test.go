package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
)

func TestChangeEmailRequiresAuth(t *testing.T) {
	prev := config.C
	config.C = &config.Config{Env: "production", CORSOrigin: "http://a.com", JWTSecret: "test-secret-test-secret-test-secret-1"}
	t.Cleanup(func() { config.C = prev })

	gin.SetMode(gin.TestMode)
	r := gin.New()
	Setup(r, controllers.NewHandler(stores.New(nil)))

	req := httptest.NewRequest(http.MethodPut, "/api/v1/me/email", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

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
