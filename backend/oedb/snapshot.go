package oedb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// DefaultSnapshotURLs are the published static copies of the catalog, tried in order:
// GitHub Pages, then the raw branch the Pages site is built from.
var DefaultSnapshotURLs = []string{
	"https://cawlumm.github.io/open-exercise-db/v1",
	"https://raw.githubusercontent.com/Cawlumm/open-exercise-db/catalog/v1",
}

// SnapshotSchemaVersion is the only manifest schema this reader understands.
const SnapshotSchemaVersion = 1

// MaxSnapshotBody caps one downloaded body. A var so a test can shrink it.
var MaxSnapshotBody int64 = 32 << 20

// ErrSnapshotUnchanged is what an accept callback returns to say "this manifest is the one
// already applied": Load then stops before fetching any data file.
var ErrSnapshotUnchanged = errors.New("oedb: snapshot unchanged")

var (
	localeCodeRE = regexp.MustCompile(`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$`)
	fileNameRE   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
	sha256RE     = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
)

// SnapshotLocale is one manifest entry.
type SnapshotLocale struct {
	Code   string `json:"code"`
	File   string `json:"file"`
	Total  int    `json:"total"`
	SHA256 string `json:"sha256"`
}

// Manifest is the small, mutable index of a published snapshot. Everything it points at is
// content-addressed and immutable.
type Manifest struct {
	SchemaVersion int              `json:"schema_version"`
	GeneratedAt   time.Time        `json:"generated_at"`
	Source        string           `json:"source"`
	Locales       []SnapshotLocale `json:"locales"`
}

// LoadedSnapshot is one source that validated. Exercises is nil when Unchanged.
type LoadedSnapshot struct {
	// URL is the base the snapshot was read from; Manifest.Source is the API it was built from.
	URL         string
	GeneratedAt time.Time
	Source      string
	Locales     []string
	Unchanged   bool
	Exercises   map[string][]Exercise
}

// Snapshot reads the catalog from static copies, trying each base URL in order. Safe for
// concurrent use.
type Snapshot struct {
	bases     []string
	userAgent string
	http      *http.Client

	mu        sync.Mutex
	manifests map[string]*cachedManifest
	files     map[string][]Exercise
}

type cachedManifest struct {
	body         []byte
	etag         string
	lastModified string
}

// NewSnapshot builds a reader over bases, tried in order. The User-Agent is the same as
// the API client's.
func NewSnapshot(bases []string, version string) *Snapshot {
	if version == "" {
		version = "dev"
	}
	clean := make([]string, 0, len(bases))
	for _, b := range bases {
		if b = strings.TrimRight(strings.TrimSpace(b), "/"); b != "" {
			clean = append(clean, b)
		}
	}
	return &Snapshot{
		bases:     clean,
		userAgent: fmt.Sprintf("lyftr/%s (+https://github.com/Cawlumm/lyftr)", version),
		http:      &http.Client{Timeout: 90 * time.Second},
		manifests: map[string]*cachedManifest{},
		files:     map[string][]Exercise{},
	}
}

// Bases lists the configured base URLs.
func (s *Snapshot) Bases() []string { return append([]string(nil), s.bases...) }

// Load returns the first source that fully validates. accept, when non-nil, sees each
// validated manifest before any data file is fetched: nil proceeds, ErrSnapshotUnchanged
// returns an Unchanged result without data, and any other error rejects that source (the
// next one is tried). When every source fails the error lists each reason.
func (s *Snapshot) Load(ctx context.Context, accept func(Manifest) error) (*LoadedSnapshot, error) {
	if len(s.bases) == 0 {
		return nil, errors.New("oedb: no snapshot URLs configured")
	}
	var reasons []string
	for _, base := range s.bases {
		got, err := s.loadOne(ctx, base, accept)
		if err == nil {
			return got, nil
		}
		reasons = append(reasons, fmt.Sprintf("%s: %v", base, err))
		if ctx.Err() != nil {
			break
		}
	}
	return nil, fmt.Errorf("no snapshot usable: %s", strings.Join(reasons, "; "))
}

func (s *Snapshot) loadOne(ctx context.Context, base string, accept func(Manifest) error) (*LoadedSnapshot, error) {
	raw, err := s.manifestBody(ctx, base)
	if err != nil {
		return nil, err
	}
	m, err := parseManifest(raw)
	if err != nil {
		return nil, err
	}
	out := &LoadedSnapshot{URL: base, GeneratedAt: m.GeneratedAt, Source: m.Source}
	for _, l := range m.Locales {
		out.Locales = append(out.Locales, l.Code)
	}
	if accept != nil {
		if err := accept(m); errors.Is(err, ErrSnapshotUnchanged) {
			out.Unchanged = true
			return out, nil
		} else if err != nil {
			return nil, err
		}
	}
	out.Exercises = map[string][]Exercise{}
	for _, l := range m.Locales {
		items, err := s.localeFile(ctx, base, l)
		if err != nil {
			return nil, fmt.Errorf("locale %q: %w", l.Code, err)
		}
		out.Exercises[l.Code] = items
	}
	if err := checkIDs(out.Exercises); err != nil {
		return nil, err
	}
	s.keepOnly(base, m)
	return out, nil
}

func parseManifest(raw []byte) (Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("manifest: %w", err)
	}
	if m.SchemaVersion != SnapshotSchemaVersion {
		return m, fmt.Errorf("manifest schema_version %d, want %d", m.SchemaVersion, SnapshotSchemaVersion)
	}
	if m.GeneratedAt.IsZero() {
		return m, errors.New("manifest has no generated_at")
	}
	seen := map[string]bool{}
	hasEN := false
	for _, l := range m.Locales {
		if !localeCodeRE.MatchString(l.Code) {
			return m, fmt.Errorf("manifest locale code %q is malformed", l.Code)
		}
		key := strings.ToLower(l.Code)
		if seen[key] {
			return m, fmt.Errorf("manifest lists locale %q twice", l.Code)
		}
		seen[key] = true
		if l.Code == "en" {
			hasEN = true
		}
		if !fileNameRE.MatchString(l.File) || strings.Contains(l.File, "..") {
			return m, fmt.Errorf("manifest file name %q for %q is not safe", l.File, l.Code)
		}
		if !sha256RE.MatchString(l.SHA256) {
			return m, fmt.Errorf("manifest sha256 for %q is malformed", l.Code)
		}
		if l.Total < 0 {
			return m, fmt.Errorf("manifest total for %q is negative", l.Code)
		}
	}
	if !hasEN {
		return m, errors.New("manifest has no en locale")
	}
	return m, nil
}

// checkIDs: English ids are unique and non-empty; every other locale lists only English ids.
func checkIDs(all map[string][]Exercise) error {
	en := map[string]bool{}
	for _, e := range all["en"] {
		if e.ID == "" {
			return errors.New("en has an exercise with no id")
		}
		if en[e.ID] {
			return fmt.Errorf("en lists id %s twice", e.ID)
		}
		en[e.ID] = true
	}
	for code, items := range all {
		if code == "en" {
			continue
		}
		seen := map[string]bool{}
		for _, e := range items {
			if !en[e.ID] {
				return fmt.Errorf("%s lists id %s, which en does not", code, e.ID)
			}
			if seen[e.ID] {
				return fmt.Errorf("%s lists id %s twice", code, e.ID)
			}
			seen[e.ID] = true
		}
	}
	return nil
}

func (s *Snapshot) manifestBody(ctx context.Context, base string) ([]byte, error) {
	u := base + "/manifest.json"
	s.mu.Lock()
	cached := s.manifests[base]
	s.mu.Unlock()
	hdr := map[string]string{}
	if cached != nil {
		if cached.etag != "" {
			hdr["If-None-Match"] = cached.etag
		}
		if cached.lastModified != "" {
			hdr["If-Modified-Since"] = cached.lastModified
		}
	}
	resp, body, err := s.get(ctx, u, hdr, true)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotModified {
		if cached == nil {
			return nil, errors.New("manifest: 304 with nothing cached")
		}
		return cached.body, nil
	}
	s.mu.Lock()
	s.manifests[base] = &cachedManifest{body: body, etag: resp.Header.Get("ETag"), lastModified: resp.Header.Get("Last-Modified")}
	s.mu.Unlock()
	return body, nil
}

func (s *Snapshot) localeFile(ctx context.Context, base string, l SnapshotLocale) ([]Exercise, error) {
	key := base + "/" + l.File + "#" + strings.ToLower(l.SHA256)
	s.mu.Lock()
	items, ok := s.files[key]
	s.mu.Unlock()
	if ok {
		return items, nil
	}
	_, body, err := s.get(ctx, base+"/"+url.PathEscape(l.File), nil, false)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(body)
	if got := hex.EncodeToString(sum[:]); !strings.EqualFold(got, l.SHA256) {
		return nil, fmt.Errorf("sha256 is %s, manifest says %s", got, l.SHA256)
	}
	var doc struct {
		Exercises []Exercise `json:"exercises"`
		Total     int        `json:"total"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	if doc.Total != len(doc.Exercises) || l.Total != len(doc.Exercises) {
		return nil, fmt.Errorf("lists %d exercises, file says %d, manifest says %d", len(doc.Exercises), doc.Total, l.Total)
	}
	s.mu.Lock()
	s.files[key] = doc.Exercises
	s.mu.Unlock()
	return doc.Exercises, nil
}

// keepOnly forgets cached data files of base that the manifest no longer names.
func (s *Snapshot) keepOnly(base string, m Manifest) {
	keep := map[string]bool{}
	for _, l := range m.Locales {
		keep[base+"/"+l.File+"#"+strings.ToLower(l.SHA256)] = true
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.files {
		if strings.HasPrefix(k, base+"/") && !keep[k] {
			delete(s.files, k)
		}
	}
}

// get fetches u. Content-Type is never checked: raw.githubusercontent.com serves JSON as
// text/plain. A 304 is returned as such only when conditional is set.
func (s *Snapshot) get(ctx context.Context, u string, hdr map[string]string, conditional bool) (*http.Response, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", s.userAgent)
	req.Header.Set("Accept", "application/json")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified && conditional {
		return resp, nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("%s: http %d", u, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxSnapshotBody+1))
	if err != nil {
		return nil, nil, fmt.Errorf("%s: read body: %w", u, err)
	}
	if int64(len(body)) > MaxSnapshotBody {
		return nil, nil, fmt.Errorf("%s: body over %d bytes", u, MaxSnapshotBody)
	}
	return resp, body, nil
}
