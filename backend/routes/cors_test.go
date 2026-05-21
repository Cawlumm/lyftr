package routes

import (
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
)

func TestParseOrigins(t *testing.T) {
	got := parseOrigins(" http://a.com , http://b.com ,")
	if len(got) != 2 || got[0] != "http://a.com" || got[1] != "http://b.com" {
		t.Fatalf("parseOrigins = %#v", got)
	}
	if len(parseOrigins("")) != 0 {
		t.Fatalf("empty input should yield no origins")
	}
}

func TestCORSConfig(t *testing.T) {
	// Bearer-token auth means credentials mode must stay off.
	config.C = &config.Config{Env: "production", CORSOrigin: "http://a.com,http://b.com"}
	cfg := corsConfig()
	if cfg.AllowCredentials {
		t.Error("AllowCredentials should be false")
	}
	if cfg.AllowAllOrigins {
		t.Error("an explicit allow-list should not allow all origins")
	}
	if len(cfg.AllowOrigins) != 2 {
		t.Errorf("AllowOrigins = %v, want 2 entries", cfg.AllowOrigins)
	}

	config.C = &config.Config{Env: "production", CORSOrigin: "*"}
	if !corsConfig().AllowAllOrigins {
		t.Error(`CORS_ORIGIN="*" should allow all origins`)
	}

	config.C = &config.Config{Env: "development", CORSOrigin: "http://a.com"}
	if !corsConfig().AllowAllOrigins {
		t.Error("development should allow all origins")
	}
}
