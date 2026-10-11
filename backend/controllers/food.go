package controllers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

var offClient = &http.Client{Timeout: 5 * time.Second}

const offUserAgent = "Lyftr/1.0 (https://lyftr.app; nutrition-tracker)"

func (h *Handler) ListFoodLogs(c *gin.Context) {
	uid := middleware.UserID(c)

	// `date=` names a day in the diary, and entries carry the day they were filed
	// under, so this is a lookup rather than a zone conversion. The zone is consulted
	// only to answer "what is today" when the parameter is omitted.
	date, ok := h.resolveQueryDay(uid, c.Query("date"))
	if !ok {
		utils.Fail(c, utils.CodeInvalidDate, nil)
		return
	}
	logs, err := h.s.Food.ListByDay(uid, date)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, logs)
}

func (h *Handler) GetFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidID, nil)
		return
	}

	f, err := h.s.Food.Get(uid, lid)
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeEntryNotFound, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, f)
}

func (h *Handler) LogFood(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.LogFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	// Same normalisation the favourites path applies, and for a reason that only exists
	// since food_logs gained `brand`: the Recent tab matches logged entries against
	// Favorites by name and brand, so an untrimmed entry misses the favourite it is —
	// the star reads empty next to a food already starred. Before validation, so a
	// whitespace-only name collapses to "" and the existing `required` rule rejects it.
	req.Name = strings.TrimSpace(req.Name)
	req.Brand = strings.TrimSpace(req.Brand)
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if code, limit, bad := foodTextTooLong(req.Name, req.Brand, req.ServingSize, req.Barcode, req.ImageURL); bad {
		utils.Fail(c, code, map[string]any{"max": limit})
		return
	}

	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)
	if req.Servings == 0 {
		req.Servings = 1
	}

	day, ok := h.resolveDay(uid, req.LoggedOn, req.LoggedAt)
	if !ok {
		utils.Fail(c, utils.CodeInvalidLoggedOn, nil)
		return
	}

	f, err := h.s.Food.Create(uid, req, day)
	if utils.DBError(c, err) {
		return
	}
	utils.Created(c, f)
}

func (h *Handler) UpdateFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidID, nil)
		return
	}

	var req models.LogFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	// Same normalisation the favourites path applies, and for a reason that only exists
	// since food_logs gained `brand`: the Recent tab matches logged entries against
	// Favorites by name and brand, so an untrimmed entry misses the favourite it is —
	// the star reads empty next to a food already starred. Before validation, so a
	// whitespace-only name collapses to "" and the existing `required` rule rejects it.
	req.Name = strings.TrimSpace(req.Name)
	req.Brand = strings.TrimSpace(req.Brand)
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if code, limit, bad := foodTextTooLong(req.Name, req.Brand, req.ServingSize, req.Barcode, req.ImageURL); bad {
		utils.Fail(c, code, map[string]any{"max": limit})
		return
	}
	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)
	if req.Servings == 0 {
		req.Servings = 1
	}

	day, ok := h.resolveDay(uid, req.LoggedOn, req.LoggedAt)
	if !ok {
		utils.Fail(c, utils.CodeInvalidLoggedOn, nil)
		return
	}

	f, err := h.s.Food.Update(uid, lid, req, day)
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeEntryNotFound, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, f)
}

func (h *Handler) DeleteFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidID, nil)
		return
	}

	n, err := h.s.Food.Delete(uid, lid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.Fail(c, utils.CodeEntryNotFound, nil)
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func (h *Handler) GetDailyStats(c *gin.Context) {
	uid := middleware.UserID(c)
	date, ok := h.resolveQueryDay(uid, c.Query("date"))
	if !ok {
		utils.Fail(c, utils.CodeInvalidDate, nil)
		return
	}
	stats, err := h.s.Food.DailyMacros(uid, date)
	if utils.DBError(c, err) {
		return
	}
	stats.Date = date
	// Both halves answer for the same named day: macros from the diary's stored day,
	// the workout count from each workout's own recorded offset. Neither is resolved
	// through the account's current zone, so they cannot drift apart.
	if stats.WorkoutCount, err = h.s.Workout.CountOnLocalDay(uid, date); utils.DBError(c, err) {
		return
	}
	utils.OK(c, stats)
}

func (h *Handler) GetFoodHistory(c *gin.Context) {
	uid := middleware.UserID(c)

	days := 30
	if d, err := strconv.Atoi(c.Query("days")); err == nil && d > 0 && d <= 365 {
		days = d
	}

	// The window is counted back from the user's today — the one question a stored
	// day still cannot answer on its own.
	points, err := h.s.Food.History(uid, h.daysAgoDay(uid, days))
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, points)
}

// ─── Open Food Facts proxy ────────────────────────────────────────────────────

// offSearchResponse is a partial decode of the OFF search API response.
type offSearchResponse struct {
	Products []offProduct `json:"products"` // CGI endpoint
	Hits     []offProduct `json:"hits"`     // new search endpoint
}

// offBrands accepts both a JSON string and a JSON array of strings.
type offBrands []string

func (b *offBrands) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	if data[0] == '[' {
		var arr []string
		if err := json.Unmarshal(data, &arr); err != nil {
			return err
		}
		*b = arr
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s != "" {
		*b = []string{s}
	}
	return nil
}

// offFloat accepts a JSON number or a numeric string. OpenFoodFacts writes
// serving_quantity both ways depending on how the product was edited, and anything it
// could not parse it leaves as free text — which is not an error, it is the same "no
// quantity known" the field being absent means, so it decodes to 0.
type offFloat float64

func (f *offFloat) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
		if err != nil {
			return nil
		}
		*f = offFloat(v)
		return nil
	}
	var v float64
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	*f = offFloat(v)
	return nil
}

type offProduct struct {
	Code        string       `json:"code"`
	ProductName string       `json:"product_name"`
	Brands      offBrands    `json:"brands"`
	Nutriments  offNutrients `json:"nutriments"`
	ServingSize string       `json:"serving_size"`
	// ServingQuantity is the serving as a number, in grams or millilitres, already
	// parsed by OpenFoodFacts out of the free-text label. We do not parse the label
	// ourselves: real values include "1/4 cup 7 g", "227 g (227 g)" and "200 m (100
	// ml)". It can be absent even when a serving label is set — openfoodfacts-server#7768
	// counted 7,700+ such products — which is why 0 has to stay meaningful.
	ServingQuantity     offFloat `json:"serving_quantity"`
	ProductQuantityUnit string   `json:"product_quantity_unit"`
	ImageURL            string   `json:"image_url"`
}

// A serving spelled in any volume unit means the product's figures are per 100 ml, not
// per 100 g — OpenFoodFacts files both under the same *_100g keys.
//
// Read off the label rather than OpenFoodFacts' own serving_quantity_unit, which
// reports "ml" for every cup-based serving: "1/4 cup (7 g)" comes back as ml. The label
// is the thing the user is shown, so agreeing with it is also what looks right.
var servingVolumeRe = regexp.MustCompile(`(?i)(^|[^a-z])(ml|cl|dl|l|litres?|liters?)([^a-z]|$)`)

func servingUnit(label, productQuantityUnit string) string {
	if servingVolumeRe.MatchString(label) {
		return "ml"
	}
	// No label to read: the pack size is the only other signal, and it is only
	// sometimes filled in. "1l" of sunflower oil gives ml; a crisp packet gives g.
	if strings.TrimSpace(label) == "" && strings.EqualFold(strings.TrimSpace(productQuantityUnit), "ml") {
		return "ml"
	}
	return "g"
}

type offNutrients struct {
	EnergyKcal100g    float64 `json:"energy-kcal_100g"`
	Proteins100g      float64 `json:"proteins_100g"`
	Carbohydrates100g float64 `json:"carbohydrates_100g"`
	Fat100g           float64 `json:"fat_100g"`
	Fiber100g         float64 `json:"fiber_100g"`

	EnergyKcalServing    float64 `json:"energy-kcal_serving"`
	ProteinsServing      float64 `json:"proteins_serving"`
	CarbohydratesServing float64 `json:"carbohydrates_serving"`
	FatServing           float64 `json:"fat_serving"`
	FiberServing         float64 `json:"fiber_serving"`
}

func offProductToResult(p offProduct) models.FoodSearchResult {
	brand := strings.Join(p.Brands, ", ")
	imageURL := p.ImageURL
	if !strings.HasPrefix(imageURL, "https://") {
		imageURL = ""
	}

	// Prefer per-serving values when OFF provides them and a serving size label.
	// Fall back to per-100g so the label always matches the numbers.
	useServing := p.Nutriments.EnergyKcalServing > 0 && strings.TrimSpace(p.ServingSize) != ""
	var cal, pro, carb, fat, fiber float64
	var servingLabel string
	unit := servingUnit(p.ServingSize, p.ProductQuantityUnit)
	servingQuantity := float64(p.ServingQuantity)
	if useServing {
		cal = p.Nutriments.EnergyKcalServing
		pro = p.Nutriments.ProteinsServing
		carb = p.Nutriments.CarbohydratesServing
		fat = p.Nutriments.FatServing
		fiber = p.Nutriments.FiberServing
		servingLabel = p.ServingSize
	} else {
		cal = p.Nutriments.EnergyKcal100g
		pro = p.Nutriments.Proteins100g
		carb = p.Nutriments.Carbohydrates100g
		fat = p.Nutriments.Fat100g
		fiber = p.Nutriments.Fiber100g
		// "100 g", not "per 100g": the serving branch above passes through
		// OpenFoodFacts' own label ("30 g", "250 ml"), which carries no preposition, and
		// the clients supply the "per". Including it here produced "per per 100g".
		//
		// "100 ml" for a liquid, because that is what the figures are: OpenFoodFacts
		// files per-100ml values under the same *_100g keys, which is how a bottle of
		// olive oil came to read 800 kcal per "100 g" (#171).
		servingLabel = "100 " + unit
		servingQuantity = 100
	}

	return models.FoodSearchResult{
		Name:        p.ProductName,
		Brand:       brand,
		Calories:    cal,
		Protein:     pro,
		Carbs:       carb,
		Fat:         fat,
		Fiber:       fiber,
		ServingSize: servingLabel,
		// 0 when OpenFoodFacts knows a serving but not its size. The clients read that
		// as "weight entry is not available for this one" and stay on servings, which
		// is the truth — better than scaling against a made-up number.
		ServingQuantity: servingQuantity,
		ServingUnit:     unit,
		Barcode:         p.Code,
		ImageURL:        imageURL,
		Source:          "off",
	}
}

func doOFFRequest(ctx context.Context, rawURL string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", offUserAgent)

	resp, err := offClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20)) // 4 MB limit
	return body, resp.StatusCode, err
}

func (h *Handler) SearchFood(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		utils.Fail(c, utils.CodeSearchTermRequired, nil)
		return
	}

	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	start := time.Now()
	searchURL := fmt.Sprintf(
		"https://search.openfoodfacts.org/search?q=%s&lang=en&cc=world&page_size=%d&page=1&fields=code,product_name,brands,nutriments,serving_size,image_url",
		url.QueryEscape(q), limit,
	)
	log.Printf("[food/search] OFF request: q=%q limit=%d", q, limit)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	body, status, err := doOFFRequest(ctx, searchURL)
	elapsed := time.Since(start)
	log.Printf("[food/search] OFF response: status=%d duration=%dms", status, elapsed.Milliseconds())

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[food/search] OFF timeout after %dms", elapsed.Milliseconds())
			utils.Fail(c, utils.CodeFoodDatabaseTimeout, nil)
			return
		}
		log.Printf("[food/search] OFF network error: %v", err)
		utils.Fail(c, utils.CodeFoodDatabaseUnreachable, nil)
		return
	}

	switch {
	case status == 429:
		log.Printf("[food/search] OFF rate limit hit")
		c.Header("Retry-After", "60")
		utils.Fail(c, utils.CodeRateLimited, nil)
		return
	case status >= 500:
		log.Printf("[food/search] OFF upstream error: %d", status)
		utils.Fail(c, utils.CodeFoodSearchUnavailable, nil)
		return
	case status != 200:
		log.Printf("[food/search] OFF unexpected status: %d", status)
		utils.Fail(c, utils.CodeFoodSearchUnavailable, nil)
		return
	}

	var parsed offSearchResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("[food/search] OFF parse error: %v", err)
		utils.InternalError(c)
		return
	}

	products := parsed.Hits
	if len(products) == 0 {
		products = parsed.Products // fallback for CGI-style response
	}
	results := make([]models.FoodSearchResult, 0, len(products))
	for _, p := range products {
		if p.ProductName == "" {
			continue
		}
		results = append(results, offProductToResult(p))
	}
	utils.OK(c, results)
}

// offBarcodeResponse is a partial decode of the OFF v3 product endpoint.
type offBarcodeResponse struct {
	Status  string     `json:"status"` // v3 API returns "success" | "failure"
	Product offProduct `json:"product"`
}

func (h *Handler) LookupBarcode(c *gin.Context) {
	code := c.Param("code")

	matched, err := regexp.MatchString(`^\d{6,14}$`, code)
	if err != nil || !matched {
		utils.Fail(c, utils.CodeInvalidBarcode, nil)
		return
	}

	start := time.Now()
	lookupURL := fmt.Sprintf("https://world.openfoodfacts.org/api/v3/product/%s.json", url.PathEscape(code))
	log.Printf("[food/barcode] OFF request: code=%q", code)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	body, status, err := doOFFRequest(ctx, lookupURL)
	elapsed := time.Since(start)
	log.Printf("[food/barcode] OFF response: status=%d duration=%dms", status, elapsed.Milliseconds())

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[food/barcode] OFF timeout after %dms", elapsed.Milliseconds())
			utils.Fail(c, utils.CodeFoodDatabaseTimeout, nil)
			return
		}
		log.Printf("[food/barcode] OFF network error: %v", err)
		utils.Fail(c, utils.CodeFoodDatabaseUnreachable, nil)
		return
	}

	switch {
	case status == 429:
		log.Printf("[food/barcode] OFF rate limit hit")
		c.Header("Retry-After", "60")
		utils.Fail(c, utils.CodeRateLimited, nil)
		return
	case status >= 500:
		log.Printf("[food/barcode] OFF upstream error: %d", status)
		utils.Fail(c, utils.CodeBarcodeLookupUnavailable, nil)
		return
	}

	var parsed offBarcodeResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("[food/barcode] OFF parse error: %v", err)
		utils.InternalError(c)
		return
	}

	if !strings.HasPrefix(parsed.Status, "success") || parsed.Product.ProductName == "" {
		utils.Fail(c, utils.CodeProductNotFound, nil)
		return
	}

	utils.OK(c, offProductToResult(parsed.Product))
}

// ─── Saved Foods ──────────────────────────────────────────────────────────────

func (h *Handler) ListSavedFoods(c *gin.Context) {
	uid := middleware.UserID(c)

	foods, err := h.s.Food.ListSaved(uid)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, foods)
}

func (h *Handler) CreateSavedFood(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.SaveFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	// Surrounding whitespace is not a distinguishing feature of a food:
	// "Oats" and "Oats " are the same favourite, and storing both leaves the
	// user with two rows that render identically and cannot be told apart.
	// Trimming happens before validation, not after, for two reasons: a lone
	// space passes `required` (it is not an empty string) but is not a name,
	// and the length limits below should measure the value that gets stored.
	req.Name = strings.TrimSpace(req.Name)
	req.Brand = strings.TrimSpace(req.Brand)
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if code, limit, bad := foodTextTooLong(req.Name, req.Brand, req.ServingSize, req.Barcode, ""); bad {
		utils.Fail(c, code, map[string]any{"max": limit})
		return
	}

	f, created, err := h.s.Food.CreateSaved(uid, req)
	// Explicit, because utils.DBError treats sql.ErrNoRows as "not an error" and returns
	// without writing anything — which would let a zero-valued row leave here as a 200.
	if errors.Is(err, sql.ErrNoRows) {
		utils.InternalError(c)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	// 200 rather than 201 when the star was already set. Nothing was created, and
	// answering 201 twice for the same food is how the duplicates in #115 read to a
	// client that was checking.
	if !created {
		utils.OK(c, f)
		return
	}
	utils.Created(c, f)
}

func (h *Handler) DeleteSavedFood(c *gin.Context) {
	uid := middleware.UserID(c)
	fid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidID, nil)
		return
	}

	n, err := h.s.Food.DeleteSaved(uid, fid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.Fail(c, utils.CodeSavedFoodNotFound, nil)
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

// foodTextTooLong checks the free-text columns against their limits, in the order the
// form lists them, and reports the first one that is over. Lengths are bytes, as before.
func foodTextTooLong(name, brand, servingSize, barcode, imageURL string) (code utils.Code, limit int, bad bool) {
	for _, f := range []struct {
		value string
		limit int
		code  utils.Code
	}{
		{name, 200, utils.CodeFoodNameTooLong},
		{brand, 200, utils.CodeFoodBrandTooLong},
		{servingSize, 100, utils.CodeServingSizeTooLong},
		{barcode, 50, utils.CodeBarcodeTooLong},
		{imageURL, 500, utils.CodeImageURLTooLong},
	} {
		if len(f.value) > f.limit {
			return f.code, f.limit, true
		}
	}
	return code, 0, false
}
