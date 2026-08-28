package controllers

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"unicode"
)

// Everything the API says lands in the same `error` field, and the client renders it
// verbatim — apiErrorMessage prefers a server message over anything it would write
// itself, because a server message is the most specific thing available. That makes
// this copy the product's copy, not internal logging.
//
// validation.go has answered in sentences since it was written ("Calories must be a
// number."). Every other handler answered in log lines ("workout not found"), so a
// login form could show one of each, stacked. This pins the agreement rather than the
// individual strings: a new handler is free to say anything, in this voice.
//
// Lives in controllers, not utils, because CI runs `go test ./controllers/ ./db/
// ./routes/` — a guard in a package CI never runs is a guard that does not exist.

var messageHelpers = map[string]bool{
	"BadRequest":         true,
	"Unauthorized":       true,
	"Forbidden":          true,
	"NotFound":           true,
	"Conflict":           true,
	"ServiceUnavailable": true,
}

// backendRoot walks up from this package to the module root, so the scan covers
// middleware and stores as well as controllers.
func backendRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Dir(wd)
}

func checkSentence(t *testing.T, where, msg string, terminal bool) {
	t.Helper()
	if msg == "" {
		return
	}
	if strings.TrimSpace(msg) != strings.TrimRight(msg, " ") {
		t.Errorf("%s: %q has leading whitespace", where, msg)
	}
	if first := []rune(msg)[0]; !unicode.IsUpper(first) {
		t.Errorf("%s: %q should start with a capital — it is shown to a person, not logged", where, msg)
	}
	if !terminal {
		return
	}
	switch msg[len(msg)-1] {
	case '.', '!', '?':
	default:
		t.Errorf("%s: %q should end in punctuation, like the validator's own messages", where, msg)
	}
}

func TestEveryAPIMessageIsASentence(t *testing.T) {
	root := backendRoot(t)
	fset := token.NewFileSet()

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if name := info.Name(); name == "data" || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		file, perr := parser.ParseFile(fset, path, nil, 0)
		if perr != nil {
			return perr
		}

		ast.Inspect(file, func(n ast.Node) bool {
			// const RegistrationClosedMessage = "..." — a message by another route.
			if vs, ok := n.(*ast.ValueSpec); ok {
				for i, name := range vs.Names {
					if !strings.HasSuffix(name.Name, "Message") || i >= len(vs.Values) {
						continue
					}
					if lit, ok := vs.Values[i].(*ast.BasicLit); ok && lit.Kind == token.STRING {
						if s, e := strconv.Unquote(lit.Value); e == nil {
							checkSentence(t, fset.Position(lit.Pos()).String(), s, true)
						}
					}
				}
				return true
			}

			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) < 2 {
				return true
			}
			switch fn := call.Fun.(type) {
			case *ast.SelectorExpr: // utils.NotFound(c, "…")
				if !messageHelpers[fn.Sel.Name] {
					return true
				}
			case *ast.Ident: // inside package utils itself
				if !messageHelpers[fn.Name] {
					return true
				}
			default:
				return true
			}

			pos := fset.Position(call.Pos()).String()
			switch arg := call.Args[1].(type) {
			case *ast.BasicLit:
				if arg.Kind == token.STRING {
					if s, e := strconv.Unquote(arg.Value); e == nil {
						checkSentence(t, pos, s, true)
					}
				}
			case *ast.BinaryExpr:
				// "Unknown timezone: " + zone + "." — only the opening literal is fixed,
				// so the capital is checkable and the full stop is not.
				if lit, ok := arg.X.(*ast.BasicLit); ok && lit.Kind == token.STRING {
					if s, e := strconv.Unquote(lit.Value); e == nil {
						checkSentence(t, pos, s, false)
					}
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatalf("walking backend: %v", err)
	}
}
