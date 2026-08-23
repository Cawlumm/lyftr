package main

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func clientIPForTest(t *testing.T, trusted []string, remoteAddr, forwardedFor string) string {
	t.Helper()

	gin.SetMode(gin.TestMode)
	r, err := newRouter(trusted)
	if err != nil {
		t.Fatalf("newRouter(%v): %v", trusted, err)
	}

	var got string
	r.GET("/", func(c *gin.Context) {
		got = c.ClientIP()
		c.Status(204)
	})

	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = remoteAddr
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	r.ServeHTTP(httptest.NewRecorder(), req)
	return got
}

func TestClientIPIgnoresSpoofedForwardedForWithoutTrustedProxy(t *testing.T) {
	got := clientIPForTest(t, nil, "192.168.1.50:54321", "198.51.100.99")
	if got != "192.168.1.50" {
		t.Fatalf("ClientIP() = %q, want socket peer %q", got, "192.168.1.50")
	}
}

func TestClientIPStopsAtLANClientBehindTrustedProxy(t *testing.T) {
	// nginx appends the socket client to any inbound XFF. Trusting only the actual
	// proxy means the private LAN client is the first untrusted hop; attacker input
	// farther left must stay unreachable.
	got := clientIPForTest(
		t,
		[]string{"172.18.0.3"},
		"172.18.0.3:54321",
		"198.51.100.99, 192.168.1.50",
	)
	if got != "192.168.1.50" {
		t.Fatalf("ClientIP() = %q, want rightmost untrusted client %q", got, "192.168.1.50")
	}
}

func TestInvalidTrustedProxyIsRejected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	if _, err := newRouter([]string{"not-an-ip-or-cidr"}); err == nil {
		t.Fatal("newRouter accepted invalid proxy config")
	}
}
