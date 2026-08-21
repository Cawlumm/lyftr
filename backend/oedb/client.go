// Package oedb is Lyftr's client for open-exercise-db, the upstream community
// exercise catalog.
//
// Lyftr queries oedb rather than mirroring it. The local exercises table still
// exists, but as a snapshot of rows a user has actually seen — see
// stores.ExerciseStore.Materialize — not as a copy of the catalog kept in step by
// a periodic sync. Search, filtering and ordering are answered upstream, so the
// data Lyftr shows improves when oedb improves, without a redeploy.
//
// The cache here is what makes that affordable. oedb serves list and detail reads
// with `Cache-Control: public, max-age=300, stale-while-revalidate=86400` plus an
// ETag, so one popular query costs oedb roughly twelve requests an hour no matter
// how many Lyftr users run it. Caching in the backend rather than the browser is
// deliberate: it is one cache shared by every user of an instance, and it keeps
// Lyftr's own API contract unchanged.
package oedb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DefaultBaseURL is the hosted instance. Override with OEDB_BASE_URL to point a
// self-hosted Lyftr at a self-hosted catalog.
const DefaultBaseURL = "https://oedb-api-o4dqddih5q-uk.a.run.app"

// maxPerPage is oedb's cap; asking for more is a 422, not a clamp.
const maxPerPage = 100

// Client is a cache-aware reader for the oedb HTTP API. Safe for concurrent use.
type Client struct {
	baseURL   string
	userAgent string
	http      *http.Client

	mu    sync.Mutex
	cache map[string]*entry
}

// entry is one cached response body plus the metadata needed to revalidate it.
type entry struct {
	body       []byte
	etag       string
	freshFor   time.Time // max-age boundary
	staleFor   time.Time // stale-while-revalidate boundary
	refreshing bool      // a background revalidation is already in flight
}

// New builds a client. An empty baseURL selects DefaultBaseURL.
//
// The User-Agent is not cosmetic: oedb tiers rate limits on caller identity, and
// a request with a generic or absent User-Agent is served 5 requests/minute
// instead of 60. Identifying properly is the difference between a working
// exercise picker and a 429.
func New(baseURL, version string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if version == "" {
		version = "dev"
	}
	return &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		userAgent: fmt.Sprintf("lyftr/%s (+https://github.com/Cawlumm/lyftr)", version),
		// Generous, because this bounds the slowest legitimate call — the ~300 KB
		// bulk export, measured at ~14s against the hosted instance. Interactive
		// reads must not inherit that patience, so they carry their own deadline:
		// see the context each caller passes in.
		http:  &http.Client{Timeout: 90 * time.Second},
		cache: map[string]*entry{},
	}
}

// ListParams are the filters Lyftr forwards upstream. Zero values are omitted,
// so the zero ListParams asks for the unfiltered first page.
type ListParams struct {
	Query       string
	MuscleGroup string
	Category    string
	Equipment   string
	Page        int
	PerPage     int
}

func (p ListParams) query() url.Values {
	v := url.Values{}
	set := func(k, s string) {
		if s = strings.TrimSpace(s); s != "" {
			v.Set(k, s)
		}
	}
	set("q", p.Query)
	set("muscle_group", p.MuscleGroup)
	set("category", p.Category)
	set("equipment", p.Equipment)
	if p.Page > 1 {
		v.Set("page", strconv.Itoa(p.Page))
	}
	per := p.PerPage
	if per <= 0 {
		per = maxPerPage
	}
	if per > maxPerPage {
		per = maxPerPage
	}
	v.Set("per_page", strconv.Itoa(per))
	return v
}

// Image is one rendition of an exercise image. Lyftr uses the first image's URL
// and ignores variants for now.
type Image struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	ContentType string `json:"content_type"`
	License     string `json:"license"`
}

// Translation is the locale-resolved text for an exercise. oedb keeps name and
// instructions here rather than on the exercise because they vary by locale
// while the taxonomy does not.
type Translation struct {
	Name         string   `json:"name"`
	Aliases      []string `json:"aliases"`
	Instructions []string `json:"instructions"`
	Locale       string   `json:"name_locale"`
}

// Exercise is one oedb catalog row, trimmed to the fields Lyftr reads.
type Exercise struct {
	ID               string      `json:"id"`
	Slug             string      `json:"slug"`
	SourceID         string      `json:"source_id"`
	MuscleGroup      string      `json:"muscle_group"`
	SecondaryMuscles []string    `json:"secondary_muscles"`
	Category         string      `json:"category"`
	Equipment        string      `json:"equipment"`
	Mechanic         string      `json:"mechanic"`
	Force            string      `json:"force"`
	Level            string      `json:"level"`
	Images           []Image     `json:"images"`
	Translation      Translation `json:"translation"`
}

// Name is the display name, which lives on the translation.
func (e Exercise) Name() string { return e.Translation.Name }

// Description renders the instruction steps as the single numbered block
// Lyftr's description column holds.
//
// The numbering is not decoration: every exercise seeded before oedb was stored
// in exactly this shape by seed.buildInstructions, and the UI renders the column
// as preformatted text. Joining with blank lines instead would make the same
// exercise look different depending on whether its row predates the migration.
func (e Exercise) Description() string {
	var b strings.Builder
	for i, step := range e.Translation.Instructions {
		if i > 0 {
			b.WriteByte('\n')
		}
		fmt.Fprintf(&b, "%d. %s", i+1, step)
	}
	return b.String()
}

// ImageURL returns an absolute URL for the first image, or "" when there is
// none. oedb serves image URLs relative to its own origin, so they are unusable
// verbatim by a client that is not oedb.
func (e Exercise) ImageURL(baseURL string) string {
	if len(e.Images) == 0 {
		return ""
	}
	u := e.Images[0].URL
	if u == "" || strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		return u
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(u, "/")
}

// BaseURL exposes the configured origin so callers can absolutize image URLs.
func (c *Client) BaseURL() string { return c.baseURL }

// ListResult is one page of catalog results.
type ListResult struct {
	Exercises []Exercise `json:"exercises"`
	Total     int        `json:"total"`
	Page      int        `json:"page"`
	PerPage   int        `json:"per_page"`
}

// List queries the catalog.
func (c *Client) List(ctx context.Context, p ListParams) (ListResult, error) {
	var out ListResult
	err := c.getJSON(ctx, "/api/v1/exercises?"+p.query().Encode(), &out)
	return out, err
}

// ErrNotFound is returned for a 404 so callers can tell "no such exercise" from
// "the catalog is unreachable" — the first is a client error, the second is a
// reason to fall back to the local snapshot.
var ErrNotFound = errors.New("oedb: exercise not found")

// Get fetches one exercise by its oedb UUID.
func (c *Client) Get(ctx context.Context, id string) (Exercise, error) {
	var out Exercise
	err := c.getJSON(ctx, "/api/v1/exercises/"+url.PathEscape(id), &out)
	return out, err
}

// getJSON performs a cache-aware GET and decodes the body.
func (c *Client) getJSON(ctx context.Context, path string, dst any) error {
	body, err := c.get(ctx, path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, dst); err != nil {
		return fmt.Errorf("oedb: decode %s: %w", path, err)
	}
	return nil
}

// get returns a response body, from cache when it is still fresh.
//
// The three states mirror what oedb's Cache-Control describes:
//
//   - fresh (within max-age): serve from memory, no request at all.
//   - stale but within stale-while-revalidate: serve the stale body immediately
//     and revalidate in the background. This is the state a moderately-used query
//     spends most of its life in, and serving through it is what keeps a user's
//     search off the critical path of an upstream round trip.
//   - beyond both: fetch synchronously.
func (c *Client) get(ctx context.Context, path string) ([]byte, error) {
	now := time.Now()

	c.mu.Lock()
	e, ok := c.cache[path]
	if ok && now.Before(e.freshFor) {
		body := e.body
		c.mu.Unlock()
		return body, nil
	}
	if ok && now.Before(e.staleFor) && len(e.body) > 0 {
		body := e.body
		if !e.refreshing {
			e.refreshing = true
			go c.revalidate(path)
		}
		c.mu.Unlock()
		return body, nil
	}
	etag := ""
	if ok {
		etag = e.etag
	}
	c.mu.Unlock()

	return c.fetch(ctx, path, etag)
}

// revalidate refreshes a stale entry off the request path. It deliberately uses
// its own timeout-bounded context rather than the caller's: the caller has
// already been served, and cancelling the refresh when that request finishes
// would mean the entry never refreshes under steady traffic.
func (c *Client) revalidate(path string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	c.mu.Lock()
	etag := ""
	if e, ok := c.cache[path]; ok {
		etag = e.etag
	}
	c.mu.Unlock()

	_, _ = c.fetch(ctx, path, etag)

	c.mu.Lock()
	if e, ok := c.cache[path]; ok {
		e.refreshing = false
	}
	c.mu.Unlock()
}

// maxRateLimitRetries bounds the 429 backoff. Two retries covers a burst
// overrun, which refills in seconds; more than that means the per-minute budget
// is genuinely gone and waiting would just move the failure later.
const maxRateLimitRetries = 2

func (c *Client) fetch(ctx context.Context, path, etag string) ([]byte, error) {
	return c.fetchAttempt(ctx, path, etag, 0)
}

// retryAfter parses the delay-seconds form of Retry-After, which is what oedb
// sends. The HTTP-date form is rejected rather than guessed at: a misparsed date
// becomes an unbounded sleep, and reporting the 429 is the safer failure.
func retryAfter(h string) (time.Duration, bool) {
	secs, err := strconv.Atoi(strings.TrimSpace(h))
	if err != nil || secs < 0 || secs > 60 {
		return 0, false
	}
	// A zero-second Retry-After still needs a beat, or the retry races the refill.
	return time.Duration(secs)*time.Second + 250*time.Millisecond, true
}

func (c *Client) fetchAttempt(ctx context.Context, path, etag string, attempt int) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("oedb: build request: %w", err)
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json")
	// Deliberately NOT setting Accept-Encoding. net/http adds it and transparently
	// decompresses the response only when it owns the header; setting it by hand
	// opts out of that and hands back raw gzip bytes, which fail to decode with
	// "invalid character '\x1f'". Compression still happens — Go just does it.
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("oedb: %s: %w", path, err)
	}
	defer resp.Body.Close()

	// oedb rate-limits per tier and says when to come back. Honour that rather
	// than treating 429 as a failure: its search tier allows 60 requests a minute
	// but a far smaller instantaneous burst, so a client issuing a short run of
	// legitimate queries trips it while nowhere near the per-minute budget. A
	// caller that retries on the server's own schedule gets its data; one that
	// gives up degrades for no reason, and one that retries immediately makes it
	// worse for everyone.
	if resp.StatusCode == http.StatusTooManyRequests {
		wait, ok := retryAfter(resp.Header.Get("Retry-After"))
		if !ok || attempt >= maxRateLimitRetries {
			snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
			return nil, fmt.Errorf("oedb: %s: http 429: %s", path, strings.TrimSpace(string(snippet)))
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("oedb: %s: %w", path, ctx.Err())
		case <-time.After(wait):
		}
		return c.fetchAttempt(ctx, path, etag, attempt+1)
	}

	// 304 means the cached body is still correct: keep it and only push the
	// freshness window forward. This is the cheap path, and the reason ETags are
	// worth sending at all — a revalidation that changes nothing costs headers.
	if resp.StatusCode == http.StatusNotModified {
		c.mu.Lock()
		defer c.mu.Unlock()
		if e, ok := c.cache[path]; ok {
			fresh, stale := cacheWindow(resp.Header.Get("Cache-Control"))
			now := time.Now()
			e.freshFor = now.Add(fresh)
			e.staleFor = now.Add(fresh + stale)
			return e.body, nil
		}
		return nil, fmt.Errorf("oedb: %s: 304 with no cached body", path)
	}

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		// Cap the body read: an error page is not a reason to buffer whatever the
		// far side chose to send.
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("oedb: %s: http %d: %s", path, resp.StatusCode, strings.TrimSpace(string(snippet)))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("oedb: %s: read body: %w", path, err)
	}

	fresh, stale := cacheWindow(resp.Header.Get("Cache-Control"))
	now := time.Now()
	c.mu.Lock()
	c.cache[path] = &entry{
		body:     body,
		etag:     resp.Header.Get("ETag"),
		freshFor: now.Add(fresh),
		staleFor: now.Add(fresh + stale),
	}
	c.mu.Unlock()

	return body, nil
}

// cacheWindow reads max-age and stale-while-revalidate out of a Cache-Control
// header, falling back to a conservative 60s/0 when the header is absent or
// unparseable. The fallback is short rather than long: guessing a long freshness
// for a response that never claimed one would serve stale data on a header
// change we did not notice.
func cacheWindow(header string) (fresh, stale time.Duration) {
	fresh, stale = 60*time.Second, 0

	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		k, v, ok := strings.Cut(part, "=")
		if !ok {
			continue
		}
		secs, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil || secs < 0 {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(k)) {
		case "max-age":
			fresh = time.Duration(secs) * time.Second
		case "stale-while-revalidate":
			stale = time.Duration(secs) * time.Second
		}
	}
	return fresh, stale
}

// Export fetches the entire published catalog in one request.
//
// oedb caps per_page at 100, so assembling all ~873 exercises through List would
// take nine round trips. The export endpoint returns them in a single ~300 KB
// response carrying the same row shape, and is cached upstream for 900s rather
// than 300s. It is the right call for "give me everything" — which is exactly
// what Lyftr's exercise picker asks for — and the wrong one for anything
// filtered, where List returns far less data.
func (c *Client) Export(ctx context.Context) ([]Exercise, error) {
	var out struct {
		Exercises []Exercise `json:"exercises"`
		Total     int        `json:"total"`
	}
	if err := c.getJSON(ctx, "/api/v1/exercises/export", &out); err != nil {
		return nil, err
	}
	return out.Exercises, nil
}

// maxIDsPerRequest is oedb's documented cap for the ids filter. Exceeding it is
// a 422, not a truncation, so the batching below has to respect it rather than
// discover it.
const maxIDsPerRequest = 100

// ListByIDs fetches specific exercises by their oedb UUIDs.
//
// This is what refreshing a cache should cost: a request proportional to what is
// held, rather than the full catalog export filtered down afterwards. Until oedb
// grew this filter the export was the only route, which meant ~300 KB to
// re-read a handful of rows.
//
// Requests are issued one batch at a time rather than concurrently. The batches
// are few, each response is cached upstream, and a burst of parallel requests is
// exactly the shape that trips a rate limiter for no gain in wall-clock worth
// having.
func (c *Client) ListByIDs(ctx context.Context, ids []string) ([]Exercise, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	out := make([]Exercise, 0, len(ids))
	for start := 0; start < len(ids); start += maxIDsPerRequest {
		end := start + maxIDsPerRequest
		if end > len(ids) {
			end = len(ids)
		}

		// per_page must cover the batch, or the response is paginated and the
		// tail of the batch is silently missing — the failure would look like
		// "some rows just never refresh".
		batch := ids[start:end]
		q := url.Values{}
		q.Set("ids", strings.Join(batch, ","))
		q.Set("per_page", strconv.Itoa(len(batch)))

		var res ListResult
		if err := c.getJSON(ctx, "/api/v1/exercises?"+q.Encode(), &res); err != nil {
			return nil, err
		}
		out = append(out, res.Exercises...)
	}
	return out, nil
}
