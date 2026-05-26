package utils

import (
	"database/sql"
	"errors"
	"log"

	"github.com/gin-gonic/gin"
	sqlite "modernc.org/sqlite"
	sqlitelib "modernc.org/sqlite/lib"
)

// sqliteCode returns the SQLite result code for err, or 0 if err is not a
// modernc SQLite error.
func sqliteCode(err error) int {
	var se *sqlite.Error
	if errors.As(err, &se) {
		return se.Code()
	}
	return 0
}

// IsLocked reports whether err is a transient SQLite lock (SQLITE_BUSY /
// SQLITE_LOCKED), the kind of failure that is worth retrying rather than
// surfacing as a domain error.
func IsLocked(err error) bool {
	switch sqliteCode(err) {
	case sqlitelib.SQLITE_BUSY, sqlitelib.SQLITE_LOCKED:
		return true
	default:
		return false
	}
}

// IsUniqueViolation reports whether err is a UNIQUE/PRIMARY KEY constraint
// violation, so callers can distinguish a genuine duplicate from any other
// write failure.
func IsUniqueViolation(err error) bool {
	switch sqliteCode(err) {
	case sqlitelib.SQLITE_CONSTRAINT_UNIQUE, sqlitelib.SQLITE_CONSTRAINT_PRIMARYKEY:
		return true
	default:
		return false
	}
}

// DBError maps a database error to an HTTP response and reports whether it wrote
// one. It deliberately ignores nil and sql.ErrNoRows: "no rows" means something
// different per endpoint (401, 404, an empty 200), so each caller handles that
// itself before delegating the rest here:
//
//	err := db.DB.QueryRow(...).Scan(...)
//	if err == sql.ErrNoRows { utils.NotFound(c, "..."); return }
//	if utils.DBError(c, err) { return }
//
// A locked database becomes a 503 the client can retry; anything else is a
// logged 500. Both lock and unexpected errors are logged so a "database is
// locked" incident is visible in the server logs instead of masquerading as a
// bad login or a duplicate email.
func DBError(c *gin.Context, err error) bool {
	if err == nil || errors.Is(err, sql.ErrNoRows) {
		return false
	}
	if IsLocked(err) {
		log.Printf("db locked on %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		ServiceUnavailable(c, "the database is busy, please try again in a moment")
		return true
	}
	log.Printf("db error on %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
	InternalError(c)
	return true
}
