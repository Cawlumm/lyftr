package controllers

import (
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// BCP 47 primary language subtags are 2-3 letters, and OpenFoodFacts keys its
// languages by ISO 639-1 (es, fr, pt). The value is pasted into upstream URLs, so
// it has to be letters only.
var languageSubtagRe = regexp.MustCompile(`^[a-z]{2,3}$`)

// requestLanguage reads the optional `locale` query param and reduces it to a
// primary language subtag ("pt-BR" -> "pt"). Absent or malformed means "en".
// Generic on purpose: other localised content reads its language here too.
func requestLanguage(c *gin.Context) string {
	raw := strings.TrimSpace(c.Query("locale"))
	if i := strings.IndexAny(raw, "-_"); i >= 0 {
		raw = raw[:i]
	}
	raw = strings.ToLower(raw)
	if languageSubtagRe.MatchString(raw) {
		return raw
	}
	return "en"
}
