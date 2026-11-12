package controllers

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
)

// supersetsOmitted reports whether an update's body lists exercises but none of them carries a
// superset_group key: what a client predating supersets sends. An explicit null counts as sent.
// Every current client sends the key on every row, so "all rows null" still means unlink all.
func supersetsOmitted(c *gin.Context) bool {
	raw, ok := c.Get(gin.BodyBytesKey)
	if !ok {
		return false
	}
	body, _ := raw.([]byte)
	var probe struct {
		Exercises []map[string]json.RawMessage `json:"exercises"`
		Days      []struct {
			Exercises []map[string]json.RawMessage `json:"exercises"`
		} `json:"days"`
	}
	if json.Unmarshal(body, &probe) != nil {
		return false
	}
	rows := 0
	sent := func(exs []map[string]json.RawMessage) bool {
		for _, e := range exs {
			rows++
			for k := range e {
				// Case-insensitive, as encoding/json matches field names when it binds.
				if strings.EqualFold(k, "superset_group") {
					return true
				}
			}
		}
		return false
	}
	if sent(probe.Exercises) {
		return false
	}
	for _, d := range probe.Days {
		if sent(d.Exercises) {
			return false
		}
	}
	return rows > 0
}
