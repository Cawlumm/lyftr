package stores

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png" // oedb serves JPEG today; the e2e stub serves PNG
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
)

// Exercise thumbnails, made once from oedb's full image and kept on disk next to the database.
//
// oedb serves one rendition per image (about 750x500, 55-100 KB). Every list row drew that at
// 44-56 px, so a 50-row page cost about 3 MB from a third-party origin with a per-IP rate
// limit and scale-to-zero cold starts. wger answers the same problem the same way: its server
// makes small/medium thumbnails and the app asks for those.
const (
	// ThumbEdge is the shorter side of a thumbnail in pixels: the 56 px hero tile at 3x is 168.
	ThumbEdge = 192
	// maxSourcePixels refuses a decompression bomb before decoding it: a real oedb image is
	// ~0.4 MP, and four concurrent decodes at this cap stay under ~100 MB on a Pi.
	maxSourcePixels = 5_000_000
	maxSourceBytes  = 10 << 20
	thumbQuality    = 80
	// Concurrent oedb fetches. A first visit to a list asks for up to 50 at once; the Pi
	// should not decode 50 JPEGs together, and oedb should not see a burst from one IP.
	maxThumbFetches = 4
)

var (
	// ErrThumbUnknown: the id is not an image of any exercise this server holds. The endpoint
	// is public (an <img> cannot send a bearer token), so it must not proxy arbitrary ids.
	ErrThumbUnknown = errors.New("unknown exercise image")
	// ErrThumbUpstream: oedb could not be reached or sent something that is not an image.
	ErrThumbUpstream = errors.New("could not fetch exercise image")

	imageIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

type ThumbStore struct {
	db      *sql.DB
	dir     string
	baseURL string
	http    *http.Client
	sem     chan struct{}

	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

// NewThumbStore keeps thumbnails in dir and fetches originals from the oedb at baseURL. It
// fetches from that origin rather than the stored image_url: the two differ wherever the
// backend reaches oedb by another name than the browser does (the e2e stack's compose service).
func NewThumbStore(db *sql.DB, dir, baseURL string) *ThumbStore {
	return &ThumbStore{
		db:      db,
		dir:     dir,
		baseURL: strings.TrimRight(baseURL, "/"),
		// Never zero: a black-holed oedb must not pin a request goroutine forever. No redirects:
		// the only host this ever talks to is the configured oedb.
		http: &http.Client{
			Timeout:       15 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		sem:   make(chan struct{}, maxThumbFetches),
		locks: map[string]*sync.Mutex{},
	}
}

// Path returns the file holding the thumbnail for oedb image id, making it first if needed.
func (s *ThumbStore) Path(ctx context.Context, id string) (string, error) {
	if !imageIDPattern.MatchString(id) {
		return "", ErrThumbUnknown
	}
	path := filepath.Join(s.dir, id+".jpg")
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	known, err := s.known(id)
	if err != nil {
		return "", err
	}
	if !known {
		return "", ErrThumbUnknown
	}

	// One fetch per id: a list that shows the same exercise twice must not fetch it twice.
	lock := s.lockFor(id)
	lock.Lock()
	defer lock.Unlock()
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	case <-ctx.Done():
		return "", ctx.Err()
	}
	if err := s.make(ctx, id, path); err != nil {
		return "", err
	}
	return path, nil
}

func (s *ThumbStore) known(id string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM exercises WHERE image_url LIKE ?`, "%/api/v1/images/"+id).Scan(&n)
	return n > 0, err
}

func (s *ThumbStore) lockFor(id string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, ok := s.locks[id]
	if !ok {
		l = &sync.Mutex{}
		s.locks[id] = l
	}
	return l
}

func (s *ThumbStore) make(ctx context.Context, id, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/api/v1/images/"+id, nil)
	if err != nil {
		return err
	}
	res, err := s.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrThumbUpstream, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: oedb answered %d", ErrThumbUpstream, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxSourceBytes+1))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrThumbUpstream, err)
	}
	if len(body) > maxSourceBytes {
		return fmt.Errorf("%w: image over %d bytes", ErrThumbUpstream, maxSourceBytes)
	}
	out, err := Thumbnail(body)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrThumbUpstream, err)
	}

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	// Written whole then renamed, so a reader never serves half a file.
	tmp, err := os.CreateTemp(s.dir, id+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(out); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// Thumbnail scales an encoded image so its shorter side is ThumbEdge (never up) and returns
// it as JPEG. Transparency is flattened onto white, which is what a JPEG cannot hold.
func Thumbnail(src []byte) ([]byte, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > maxSourcePixels {
		return nil, fmt.Errorf("image is %dx%d", cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	short := min(w, h)
	if short > ThumbEdge {
		w, h = w*ThumbEdge/short, h*ThumbEdge/short
	}
	dst := image.NewRGBA(image.Rect(0, 0, max(w, 1), max(h, 1)))
	xdraw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, xdraw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: thumbQuality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
