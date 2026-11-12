package stores

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

const thumbTestID = "48fe6ee6-f6e4-4d8b-9be5-a235eb8ca7e5"

func encodeJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		for y := 0; y < h; y++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 90, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// thumbFixture is an oedb serving body for thumbTestID and a database holding one exercise
// whose image is that id. hits counts requests oedb saw.
func thumbFixture(t *testing.T, status int, body []byte) (*ThumbStore, *atomic.Int32) {
	t.Helper()
	conn := testDB(t)
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Path != "/api/v1/images/"+thumbTestID {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(status)
		w.Write(body)
	}))
	t.Cleanup(srv.Close)
	// The stored url names a different host on purpose: thumbnails fetch from the configured
	// origin, which is how the e2e stack's backend reaches the stub by its compose name.
	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group, category, equipment, image_url) VALUES ('Row', 'back', 'strength', 'barbell', ?)`,
		"http://browser-facing.example/api/v1/images/"+thumbTestID); err != nil {
		t.Fatal(err)
	}
	return NewThumbStore(conn, t.TempDir(), srv.URL+"/"), &hits
}

func TestThumbScalesShorterSideAndCaches(t *testing.T) {
	s, hits := thumbFixture(t, http.StatusOK, encodeJPEG(t, 750, 500))

	path, err := s.Path(context.Background(), thumbTestID)
	if err != nil {
		t.Fatalf("Path: %v", err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	cfg, format, err := image.DecodeConfig(f)
	if err != nil {
		t.Fatal(err)
	}
	if format != "jpeg" || cfg.Width != 288 || cfg.Height != ThumbEdge {
		t.Errorf("thumb is %s %dx%d, want jpeg 288x%d", format, cfg.Width, cfg.Height, ThumbEdge)
	}

	if _, err := s.Path(context.Background(), thumbTestID); err != nil {
		t.Fatalf("second Path: %v", err)
	}
	if n := hits.Load(); n != 1 {
		t.Errorf("oedb saw %d requests, want 1: the second must come from disk", n)
	}
}

func TestThumbFetchesOncePerIDUnderConcurrency(t *testing.T) {
	s, hits := thumbFixture(t, http.StatusOK, encodeJPEG(t, 400, 400))
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Path(context.Background(), thumbTestID); err != nil {
				t.Errorf("Path: %v", err)
			}
		}()
	}
	wg.Wait()
	if n := hits.Load(); n != 1 {
		t.Errorf("oedb saw %d requests for one id, want 1", n)
	}
}

func TestThumbRefusesIDsItDoesNotHold(t *testing.T) {
	s, hits := thumbFixture(t, http.StatusOK, encodeJPEG(t, 10, 10))
	for _, id := range []string{
		"00000000-0000-0000-0000-000000000000", // well formed, not an image of any exercise
		"../../etc/passwd",
		"48FE6EE6-F6E4-4D8B-9BE5-A235EB8CA7E5", // oedb ids are lower case
		"%",
		"",
	} {
		if _, err := s.Path(context.Background(), id); !errors.Is(err, ErrThumbUnknown) {
			t.Errorf("Path(%q) = %v, want ErrThumbUnknown", id, err)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Errorf("oedb saw %d requests, want 0: an unknown id must never be proxied", n)
	}
}

func TestThumbUpstreamFailureLeavesNothingCached(t *testing.T) {
	s, hits := thumbFixture(t, http.StatusTooManyRequests, nil)
	if _, err := s.Path(context.Background(), thumbTestID); !errors.Is(err, ErrThumbUpstream) {
		t.Fatalf("Path = %v, want ErrThumbUpstream", err)
	}
	if _, err := s.Path(context.Background(), thumbTestID); !errors.Is(err, ErrThumbUpstream) {
		t.Fatalf("second Path = %v, want ErrThumbUpstream", err)
	}
	if n := hits.Load(); n != 2 {
		t.Errorf("oedb saw %d requests, want 2: a failure must be retried, not remembered", n)
	}
	left, _ := filepath.Glob(filepath.Join(s.dir, "*"))
	if len(left) != 0 {
		t.Errorf("files left behind: %v", left)
	}
}

func TestThumbRejectsNonImage(t *testing.T) {
	s, _ := thumbFixture(t, http.StatusOK, []byte("<html>rate limited</html>"))
	if _, err := s.Path(context.Background(), thumbTestID); !errors.Is(err, ErrThumbUpstream) {
		t.Fatalf("Path = %v, want ErrThumbUpstream", err)
	}
}

func TestThumbnailNeverUpscalesAndFlattensTransparency(t *testing.T) {
	// The e2e stub serves a 1x1 transparent PNG.
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	out, err := Thumbnail(buf.Bytes())
	if err != nil {
		t.Fatalf("Thumbnail: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 1 || b.Dy() != 1 {
		t.Errorf("size %v, want 1x1", b)
	}
	if r, g, b, _ := img.At(0, 0).RGBA(); r>>8 < 250 || g>>8 < 250 || b>>8 < 250 {
		t.Errorf("transparent pixel became %d,%d,%d, want white", r>>8, g>>8, b>>8)
	}
}

func TestThumbnailRefusesHugeDimensions(t *testing.T) {
	// A PNG header claiming 100000x100000: refused from the header, before any pixel is decoded.
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewGray(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	b := buf.Bytes()
	copy(b[16:24], []byte{0, 1, 0x86, 0xa0, 0, 1, 0x86, 0xa0})
	if _, err := Thumbnail(b); err == nil {
		t.Error("Thumbnail accepted a 10-gigapixel header")
	}
}

func TestThumbDoesNotFollowRedirects(t *testing.T) {
	var elsewhere atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { elsewhere.Add(1) }))
	t.Cleanup(other.Close)
	conn := testDB(t)
	srv := httptest.NewServer(http.RedirectHandler(other.URL, http.StatusFound))
	t.Cleanup(srv.Close)
	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group, category, image_url) VALUES ('Row', 'back', 'strength', ?)`,
		"http://x/api/v1/images/"+thumbTestID); err != nil {
		t.Fatal(err)
	}
	s := NewThumbStore(conn, t.TempDir(), srv.URL)
	if _, err := s.Path(context.Background(), thumbTestID); !errors.Is(err, ErrThumbUpstream) {
		t.Errorf("Path = %v, want ErrThumbUpstream", err)
	}
	if n := elsewhere.Load(); n != 0 {
		t.Errorf("followed a redirect to another host %d times", n)
	}
}
