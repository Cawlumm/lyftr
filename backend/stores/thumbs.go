package stores

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	_ "golang.org/x/image/webp"
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
	return renderJPEG(src, maxSourcePixels, 0, thumbQuality, func(w, h int) (int, int) {
		short := min(w, h)
		if short > ThumbEdge {
			return w * ThumbEdge / short, h * ThumbEdge / short
		}
		return w, h
	})
}

// errImageTooBig: the header claims more pixels (or a longer side) than the caller allows.
var errImageTooBig = errors.New("image is too large to decode")

// renderJPEG is the one decode-cap-scale-flatten-encode pipeline: thumbnails and uploaded
// photos both go through it. The header is read first (DecodeConfig), so a decompression bomb
// is refused before any pixel is allocated. Re-encoding from pixels is also what drops EXIF
// and every other metadata segment. maxSide of 0 means no per-side cap.
func renderJPEG(src []byte, maxPixels int64, maxSide, quality int, size func(w, h int) (int, int)) ([]byte, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > maxPixels ||
		(maxSide > 0 && (cfg.Width > maxSide || cfg.Height > maxSide)) {
		return nil, fmt.Errorf("%w: %dx%d", errImageTooBig, cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	b := img.Bounds()
	// Re-encoding drops EXIF, orientation included, so a phone photo stored sideways by the
	// camera is turned upright here. Size is chosen on the upright dimensions; the scaled
	// (small) image is the one rotated.
	orient := exifOrientation(src)
	swap := orient >= 5 && orient <= 8
	sw, sh := b.Dx(), b.Dy()
	if swap {
		sw, sh = sh, sw
	}
	w, h := size(sw, sh)
	if swap {
		w, h = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, max(w, 1), max(h, 1)))
	xdraw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, xdraw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)
	out := orientRGBA(dst, orient)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, out, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// exifOrientation reads the EXIF Orientation tag (1-8) of a JPEG, or 1 when there is none or
// it cannot be read. Only the APP1 segment and IFD0 are walked; nothing else is trusted.
func exifOrientation(src []byte) int {
	if len(src) < 4 || src[0] != 0xFF || src[1] != 0xD8 {
		return 1
	}
	for i := 2; i+4 <= len(src); {
		if src[i] != 0xFF {
			return 1
		}
		marker := src[i+1]
		if marker == 0xDA || marker == 0xD9 { // start of scan / end of image: no more metadata
			return 1
		}
		n := int(src[i+2])<<8 | int(src[i+3])
		if n < 2 || i+2+n > len(src) {
			return 1
		}
		seg := src[i+4 : i+2+n]
		if marker == 0xE1 && len(seg) > 14 && string(seg[:6]) == "Exif\x00\x00" {
			return tiffOrientation(seg[6:])
		}
		i += 2 + n
	}
	return 1
}

func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var u16 func([]byte) int
	var u32 func([]byte) int
	switch string(t[:2]) {
	case "II":
		u16 = func(b []byte) int { return int(b[0]) | int(b[1])<<8 }
		u32 = func(b []byte) int { return int(b[0]) | int(b[1])<<8 | int(b[2])<<16 | int(b[3])<<24 }
	case "MM":
		u16 = func(b []byte) int { return int(b[0])<<8 | int(b[1]) }
		u32 = func(b []byte) int { return int(b[0])<<24 | int(b[1])<<16 | int(b[2])<<8 | int(b[3]) }
	default:
		return 1
	}
	off := u32(t[4:8])
	if off < 8 || off+2 > len(t) {
		return 1
	}
	count := u16(t[off : off+2])
	for k := 0; k < count; k++ {
		e := off + 2 + 12*k
		if e+12 > len(t) {
			return 1
		}
		if u16(t[e:e+2]) == 0x0112 {
			if v := u16(t[e+8 : e+10]); v >= 1 && v <= 8 {
				return v
			}
			return 1
		}
	}
	return 1
}

// orientRGBA returns src turned upright for an EXIF orientation (2-8 flip and/or rotate;
// 1 and anything else is returned as is).
func orientRGBA(src *image.RGBA, orient int) *image.RGBA {
	if orient < 2 || orient > 8 {
		return src
	}
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	dw, dh := w, h
	if orient >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch orient {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			si := y*src.Stride + x*4
			di := dy*dst.Stride + dx*4
			copy(dst.Pix[di:di+4], src.Pix[si:si+4])
		}
	}
	return dst
}
