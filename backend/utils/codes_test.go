package utils

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
	"unicode"
)

func TestCodeIDs(t *testing.T) {
	re := regexp.MustCompile(`^[A-Z][A-Z0-9_]*[A-Z0-9]$`)
	for id, c := range registry {
		if !re.MatchString(id) || len(id) > 63 {
			t.Errorf("%q is not an UPPER_SNAKE id of at most 63 characters", id)
		}
		if c.ID != id || c.Status < 400 {
			t.Errorf("%s: id %q status %d", id, c.ID, c.Status)
		}
	}
}

func TestCodeTemplatesAreSentences(t *testing.T) {
	params := map[string]any{"field": "exercises.sets.weight", "min": json.Number("8"), "max": 500, "options": "a, b", "timezone": "Mars/Base"}
	for id, c := range registry {
		if c.text == "" {
			t.Errorf("%s has no text", id)
			continue
		}
		if strings.TrimSpace(c.text) != c.text {
			t.Errorf("%s: %q has leading or trailing whitespace", id, c.text)
		}
		msg := c.Message(params)
		if !unicode.IsUpper([]rune(msg)[0]) {
			t.Errorf("%s: %q should start with a capital", id, msg)
		}
		switch msg[len(msg)-1] {
		case '.', '!', '?':
		default:
			t.Errorf("%s: %q should end in punctuation", id, msg)
		}
		if strings.Contains(msg, "{{") {
			t.Errorf("%s: unrendered placeholder in %q", id, msg)
		}
	}
}

// modelRules returns json name -> validate tags for every validated model field.
func modelRules(t *testing.T) map[string]string {
	t.Helper()
	files, err := filepath.Glob("../models/*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no model files: %v", err)
	}
	out := map[string]string{}
	fset := token.NewFileSet()
	for _, f := range files {
		file, err := parser.ParseFile(fset, f, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			field, ok := n.(*ast.Field)
			if !ok || field.Tag == nil {
				return true
			}
			tag := reflect.StructTag(strings.Trim(field.Tag.Value, "`"))
			validate := tag.Get("validate")
			name := strings.SplitN(tag.Get("json"), ",", 2)[0]
			if validate != "" && name != "" && name != "-" {
				out[name] += validate + ","
			}
			return true
		})
	}
	return out
}

func clientCatalog(t *testing.T) map[string]map[string]string {
	t.Helper()
	raw, err := os.ReadFile("../../packages/shared/src/i18n/locales/en.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Errors struct {
			API struct {
				Codes  map[string]string `json:"codes"`
				Fields map[string]string `json:"fields"`
			} `json:"api"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return map[string]map[string]string{"codes": doc.Errors.API.Codes, "fields": doc.Errors.API.Fields}
}

func keys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestClientCatalogMatchesRegistry(t *testing.T) {
	cat := clientCatalog(t)

	registered := map[string]string{}
	for id, c := range registry {
		registered[id] = c.text
	}
	if !reflect.DeepEqual(keys(cat["codes"]), keys(registered)) {
		t.Fatalf("en.json errors.api.codes keys differ from the registry:\n catalog  %v\n registry %v", keys(cat["codes"]), keys(registered))
	}
	for id, text := range registered {
		if cat["codes"][id] != text {
			t.Errorf("%s: en.json says %q, registry says %q", id, cat["codes"][id], text)
		}
	}

	fields := requestFields(t)
	if !reflect.DeepEqual(keys(cat["fields"]), keys(fields)) {
		t.Fatalf("en.json errors.api.fields keys differ from the request models' JSON names:\n catalog %v\n models  %v", keys(cat["fields"]), keys(fields))
	}
	for name, text := range cat["fields"] {
		if text != label(name) {
			t.Errorf("field %s: en.json says %q, label() says %q", name, text, label(name))
		}
	}
}

// isRequestType is the one definition of "a body a client sends": the field catalog is
// every JSON name of these, and every bind target must be one.
func isRequestType(name string) bool {
	return strings.HasSuffix(name, "Request") || strings.HasSuffix(name, "Req")
}

// requestFields returns the JSON name of every field of every models Request/Req struct.
func requestFields(t *testing.T) map[string]bool {
	t.Helper()
	files, err := filepath.Glob("../models/*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no model files: %v", err)
	}
	out := map[string]bool{}
	fset := token.NewFileSet()
	for _, f := range files {
		file, err := parser.ParseFile(fset, f, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			spec, ok := n.(*ast.TypeSpec)
			if !ok || !isRequestType(spec.Name.Name) {
				return true
			}
			st, ok := spec.Type.(*ast.StructType)
			if !ok {
				return true
			}
			for _, field := range st.Fields.List {
				if field.Tag == nil {
					continue
				}
				tag := reflect.StructTag(strings.Trim(field.Tag.Value, "`"))
				name := strings.SplitN(tag.Get("json"), ",", 2)[0]
				if name != "" && name != "-" {
					out[name] = true
				}
			}
			return true
		})
	}
	return out
}

func TestEveryModelTagHasARule(t *testing.T) {
	known := map[string]bool{"omitempty": true, "dive": true}
	for name, tags := range modelRules(t) {
		for _, part := range strings.Split(strings.Trim(tags, ","), ",") {
			tag, param, _ := strings.Cut(part, "=")
			if known[tag] {
				continue
			}
			if param == "1" && (tag == "min" || tag == "max") {
				t.Errorf("%s: %s=1 breaks the plural templates", name, part)
			}
			found := false
			for k := range rules {
				if k == tag || strings.HasPrefix(k, tag+":") {
					found = true
				}
			}
			if !found {
				t.Errorf("%s: tag %q has no rule, so it would answer INVALID_FIELD", name, tag)
			}
		}
	}
}

func TestUnlabelInvertsLabel(t *testing.T) {
	for name := range modelRules(t) {
		if got := unlabel(label(name)); got != name {
			t.Errorf("unlabel(label(%q)) = %q", name, got)
		}
	}
}

func TestMessageRendersNumbers(t *testing.T) {
	cases := []struct {
		in   any
		want string
	}{{json.Number("2000"), "2,000"}, {2000, "2000"}, {json.Number("0"), "0"}}
	for _, tc := range cases {
		got := codeAboveMaximum.Message(map[string]any{"field": "weight", "max": tc.in})
		if want := "Weight must be " + tc.want + " or less."; got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}
