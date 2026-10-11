package utils

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// responseWriters are the gin methods that put a status line on the wire.
var responseWriters = map[string]bool{
	"JSON": true, "AbortWithStatusJSON": true, "IndentedJSON": true, "PureJSON": true,
	"SecureJSON": true, "AsciiJSON": true, "JSONP": true, "String": true,
	"AbortWithStatus": true, "AbortWithError": true,
}

var bindMethods = map[string]bool{"ShouldBindJSON": true, "ShouldBind": true, "BindJSON": true}

// successStatus reports whether expr is a status below 400 spelled the way handlers spell it.
func successStatus(expr ast.Expr) bool {
	switch x := expr.(type) {
	case *ast.BasicLit:
		n, err := strconv.Atoi(x.Value)
		return x.Kind == token.INT && err == nil && n < 400
	case *ast.SelectorExpr:
		pkg, ok := x.X.(*ast.Ident)
		return ok && pkg.Name == "http" && (x.Sel.Name == "StatusOK" || x.Sel.Name == "StatusCreated" || x.Sel.Name == "StatusNoContent")
	}
	return false
}

func typeName(expr ast.Expr) string {
	switch x := expr.(type) {
	case *ast.Ident:
		return x.Name
	case *ast.SelectorExpr:
		return typeName(x.X) + "." + x.Sel.Name
	case *ast.StarExpr:
		return "*" + typeName(x.X)
	}
	return ""
}

// declaredAs returns the type of `var name T` declared anywhere inside fn.
func declaredAs(fn *ast.FuncDecl, name string) string {
	found := ""
	ast.Inspect(fn, func(n ast.Node) bool {
		spec, ok := n.(*ast.ValueSpec)
		if !ok || spec.Type == nil {
			return true
		}
		for _, id := range spec.Names {
			if id.Name == name {
				found = typeName(spec.Type)
			}
		}
		return true
	})
	return found
}

// TestErrorBodiesComeOnlyFromTheRegistry is the proof that no handler can answer with an
// English sentence of its own: every error body is built by write in response.go from a
// Code defined in codes.go. It reads the production sources, so a new handler that writes
// c.JSON(400, gin.H{"error": "..."}) fails here rather than reaching a Spanish user.
func TestErrorBodiesComeOnlyFromTheRegistry(t *testing.T) {
	root, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	fset := token.NewFileSet()
	checked := 0

	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if d.IsDir() {
			if path != root && (strings.HasPrefix(name, ".") || name == "data" || name == "vendor" || name == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		checked++
		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)
		inResponse := rel == "utils/response.go"
		inCodes := rel == "utils/codes.go"
		at := func(n ast.Node) string { return fset.Position(n.Pos()).String() }

		ast.Inspect(file, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.CallExpr:
				if sel, ok := x.Fun.(*ast.SelectorExpr); ok && responseWriters[sel.Sel.Name] && len(x.Args) > 0 && !inResponse {
					if !successStatus(x.Args[0]) {
						t.Errorf("%s: %s with a non-success status; answer errors with utils.Fail", at(x), sel.Sel.Name)
					}
				}
				if id, ok := x.Fun.(*ast.Ident); ok && id.Name == "define" && file.Name.Name == "utils" && !inCodes {
					t.Errorf("%s: define is for codes.go only", at(x))
				}
			case *ast.CompositeLit:
				if tn := typeName(x.Type); tn == "Code" || tn == "utils.Code" {
					if !inCodes {
						t.Errorf("%s: a Code is built only by define in codes.go", at(x))
					}
				}
				for _, elt := range x.Elts {
					kv, ok := elt.(*ast.KeyValueExpr)
					if !ok || inResponse {
						continue
					}
					if key, ok := kv.Key.(*ast.BasicLit); ok && key.Value == `"error"` {
						t.Errorf("%s: an \"error\" key outside utils/response.go; answer with utils.Fail", at(x))
					}
				}
			case *ast.FuncDecl:
				if file.Name.Name == "utils" && x.Name.IsExported() && x.Recv == nil && x.Type.Params != nil {
					params := x.Type.Params.List
					if len(params) > 0 && typeName(params[0].Type) == "*gin.Context" {
						for _, p := range params[1:] {
							if typeName(p.Type) == "string" {
								t.Errorf("%s: %s takes a string next to the context; that is BadRequest(c, msg) again", at(x), x.Name.Name)
							}
						}
					}
				}
				if x.Body == nil {
					return true
				}
				ast.Inspect(x.Body, func(m ast.Node) bool {
					call, ok := m.(*ast.CallExpr)
					if !ok {
						return true
					}
					sel, ok := call.Fun.(*ast.SelectorExpr)
					if !ok || !bindMethods[sel.Sel.Name] || len(call.Args) != 1 {
						return true
					}
					unary, ok := call.Args[0].(*ast.UnaryExpr)
					if !ok || unary.Op != token.AND {
						t.Errorf("%s: bind into &variable", at(call))
						return true
					}
					id, ok := unary.X.(*ast.Ident)
					if !ok {
						t.Errorf("%s: bind into &variable", at(call))
						return true
					}
					typ := declaredAs(x, id.Name)
					pkg, tn, _ := strings.Cut(typ, ".")
					if pkg != "models" || !isRequestType(tn) {
						t.Errorf("%s: %s binds into %q; use `var %s models.<Name>Request` so its fields have client wording", at(call), sel.Sel.Name, typ, id.Name)
					}
					return true
				})
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked < 20 {
		t.Fatalf("only %d source files checked; the walk is not reaching the backend", checked)
	}
}
