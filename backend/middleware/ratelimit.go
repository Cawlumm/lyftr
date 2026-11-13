package middleware

import (
	"container/list"
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

// Limiter is an in-process token bucket per key: each key holds up to burst tokens, refilled
// at rate tokens per second, and one request costs one token.
//
// Memory is bounded by maxKeys. When the table is full the least recently seen key is
// dropped, which hands that key a fresh full bucket the next time it appears. That is the
// right direction to fail for a limiter whose job is to slow guessing, not to be a ledger:
// an attacker spraying new keys to flush the table is itself capped per IP by the limiter
// in front of the same route.
type Limiter struct {
	mu      sync.Mutex
	rate    float64
	burst   float64
	maxKeys int
	now     func() time.Time
	entries map[string]*list.Element
	order   *list.List // front = most recently seen
}

type bucket struct {
	key    string
	tokens float64
	last   time.Time
}

// NewLimiter allows burst requests at once and then perMinute per minute, per key.
func NewLimiter(perMinute, burst, maxKeys int) *Limiter {
	return &Limiter{
		rate:    float64(perMinute) / 60,
		burst:   float64(burst),
		maxKeys: maxKeys,
		now:     time.Now,
		entries: make(map[string]*list.Element),
		order:   list.New(),
	}
}

// Allow spends a token for key. When none is left it reports how long until one is.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	el, ok := l.entries[key]
	var b *bucket
	if ok {
		b = el.Value.(*bucket)
		b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
		b.last = now
		l.order.MoveToFront(el)
	} else {
		for len(l.entries) >= l.maxKeys {
			oldest := l.order.Back()
			delete(l.entries, oldest.Value.(*bucket).key)
			l.order.Remove(oldest)
		}
		b = &bucket{key: key, tokens: l.burst, last: now}
		l.entries[key] = l.order.PushFront(b)
	}

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	return false, time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
}

// Refund gives back a token Allow spent, up to the bucket's burst. An unknown key is
// ignored: its bucket was evicted and is already full.
func (l *Limiter) Refund(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if el, ok := l.entries[key]; ok {
		b := el.Value.(*bucket)
		b.tokens = math.Min(l.burst, b.tokens+1)
	}
}

// Len is the number of keys currently tracked.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// Reject answers 429 with a Retry-After in whole seconds, rounded up so that waiting the
// stated time is always enough.
func Reject(c *gin.Context, wait time.Duration) {
	secs := max(1, int(math.Ceil(wait.Seconds())))
	c.Header("Retry-After", strconv.Itoa(secs))
	utils.Fail(c, utils.CodeRateLimited, nil)
}

// RateLimitIP limits a route per client address. ClientIP only reads forwarding headers
// from the trusted proxies configured on the engine, so a caller cannot choose its own key.
func RateLimitIP(l *Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if ok, wait := l.Allow(c.ClientIP()); !ok {
			Reject(c, wait)
			c.Abort()
			return
		}
		c.Next()
	}
}
