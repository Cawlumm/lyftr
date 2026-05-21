package controllers

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
)

func TestServerInfo(t *testing.T) {
	config.C = &config.Config{Version: "9.9.9"}

	c, w := newContext(0, "GET", "/api/v1/info", nil)
	ServerInfo(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	body := decodeResponse(t, w)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("missing data envelope: %v", body)
	}
	if data["name"] != "lyftr" {
		t.Errorf("name = %v, want lyftr", data["name"])
	}
	if data["version"] != "9.9.9" {
		t.Errorf("version = %v, want 9.9.9", data["version"])
	}
}
