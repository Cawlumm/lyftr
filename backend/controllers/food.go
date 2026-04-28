package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

var offClient = &http.Client{Timeout: 5 * time.Second}

const offUserAgent = "Lyftr/1.0 (https://lyftr.app; nutrition-tracker)"

// scanFoodLog scans all food_log columns including fiber.
func scanFoodLog(row interface{ Scan(...any) error }, f *models.FoodLog) error {
	return row.Scan(
		&f.ID, &f.UserID, &f.Name, &f.Meal,
		&f.Calories, &f.Protein, &f.Carbs, &f.Fat, &f.Fiber,
		&f.Servings, &f.ServingSize, &f.Barcode,
		&f.LoggedAt, &f.CreatedAt,
	)
}

const foodLogSelect = `SELECT id, user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, logged_at, created_at FROM food_logs`

func ListFoodLogs(c *gin.Context) {
	uid := middleware.UserID(c)

	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	rows, err := db.DB.Query(
		foodLogSelect+` WHERE user_id = ? AND date(logged_at) = ? ORDER BY logged_at ASC`,
		uid, date,
	)
	if err != nil {
		log.Printf("[food/list] db error: %v", err)
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	logs := []models.FoodLog{}
	for rows.Next() {
		var f models.FoodLog
		if err := scanFoodLog(rows, &f); err != nil {
			log.Printf("[food/list] scan error: %v", err)
		}
		logs = append(logs, f)
	}
	utils.OK(c, logs)
}

func GetFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	var f models.FoodLog
	row := db.DB.QueryRow(foodLogSelect+` WHERE id = ? AND user_id = ?`, lid, uid)
	if err := scanFoodLog(row, &f); err != nil {
		utils.NotFound(c, "log entry not found")
		return
	}
	utils.OK(c, f)
}

func LogFood(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.LogFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	if req.LoggedAt.IsZero() {
		req.LoggedAt = time.Now()
	}
	if req.Servings == 0 {
		req.Servings = 1
	}

	res, err := db.DB.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, logged_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.LoggedAt,
	)
	if err != nil {
		log.Printf("[food/log] db error: %v", err)
		utils.InternalError(c)
		return
	}

	id, _ := res.LastInsertId()
	var f models.FoodLog
	row := db.DB.QueryRow(foodLogSelect+` WHERE id = ?`, id)
	scanFoodLog(row, &f)
	utils.Created(c, f)
}

func UpdateFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	var req models.LogFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if req.Servings == 0 {
		req.Servings = 1
	}

	res, err := db.DB.Exec(
		`UPDATE food_logs SET name=?, meal=?, calories=?, protein=?, carbs=?, fat=?, fiber=?,
		 servings=?, serving_size=?, barcode=?, logged_at=?
		 WHERE id=? AND user_id=?`,
		req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.LoggedAt,
		lid, uid,
	)
	if err != nil {
		log.Printf("[food/update] db error: %v", err)
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "log entry not found")
		return
	}

	var f models.FoodLog
	row := db.DB.QueryRow(foodLogSelect+` WHERE id = ?`, lid)
	scanFoodLog(row, &f)
	utils.OK(c, f)
}

func DeleteFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM food_logs WHERE id = ? AND user_id = ?`, lid, uid)
	if err != nil {
		log.Printf("[food/delete] db error: %v", err)
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "log entry not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func GetDailyStats(c *gin.Context) {
	uid := middleware.UserID(c)
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	var stats models.DailyStats
	stats.Date = date

	db.DB.QueryRow(
		`SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0), COALESCE(SUM(fiber),0)
		 FROM food_logs WHERE user_id = ? AND date(logged_at) = ?`,
		uid, date,
	).Scan(&stats.TotalCalories, &stats.TotalProtein, &stats.TotalCarbs, &stats.TotalFat, &stats.TotalFiber)

	db.DB.QueryRow(
		`SELECT COUNT(*) FROM workouts WHERE user_id = ? AND date(started_at) = ?`,
		uid, date,
	).Scan(&stats.WorkoutCount)

	utils.OK(c, stats)
}

func GetFoodHistory(c *gin.Context) {
	uid := middleware.UserID(c)

	days := 30
	if d, err := strconv.Atoi(c.Query("days")); err == nil && d > 0 && d <= 365 {
		days = d
	}

	rows, err := db.DB.Query(
		`SELECT date(logged_at) as d,
		        COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0)
		 FROM food_logs
		 WHERE user_id = ? AND logged_at >= date('now', ?)
		 GROUP BY d ORDER BY d ASC`,
		uid, fmt.Sprintf("-%d days", days),
	)
	if err != nil {
		log.Printf("[food/history] db error: %v", err)
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	points := []models.FoodHistoryPoint{}
	for rows.Next() {
		var p models.FoodHistoryPoint
		rows.Scan(&p.Date, &p.Calories, &p.Protein, &p.Carbs, &p.Fat)
		points = append(points, p)
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

type offProduct struct {
	ProductName string       `json:"product_name"`
	Brands      offBrands    `json:"brands"`
	Nutriments  offNutrients `json:"nutriments"`
	ServingSize string       `json:"serving_size"`
	ImageURL    string       `json:"image_url"`
}

type offNutrients struct {
	EnergyKcal100g  float64 `json:"energy-kcal_100g"`
	Proteins100g    float64 `json:"proteins_100g"`
	Carbohydrates100g float64 `json:"carbohydrates_100g"`
	Fat100g         float64 `json:"fat_100g"`
	Fiber100g       float64 `json:"fiber_100g"`
}

func offProductToResult(p offProduct) models.FoodSearchResult {
	serving := p.ServingSize
	if serving == "" {
		serving = "100g"
	}
	brand := strings.Join(p.Brands, ", ")
	return models.FoodSearchResult{
		Name:        p.ProductName,
		Brand:       brand,
		Calories:    p.Nutriments.EnergyKcal100g,
		Protein:     p.Nutriments.Proteins100g,
		Carbs:       p.Nutriments.Carbohydrates100g,
		Fat:         p.Nutriments.Fat100g,
		Fiber:       p.Nutriments.Fiber100g,
		ServingSize: serving,
		ImageURL:    p.ImageURL,
		Source:      "off",
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

func SearchFood(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		utils.BadRequest(c, "q is required")
		return
	}

	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	start := time.Now()
	searchURL := fmt.Sprintf(
		"https://search.openfoodfacts.org/search?q=%s&lang=en&cc=world&page_size=%d&page=1&fields=product_name,brands,nutriments,serving_size,image_url",
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
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "food search timed out — try again"})
			return
		}
		log.Printf("[food/search] OFF network error: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "could not reach food database"})
		return
	}

	switch {
	case status == 429:
		log.Printf("[food/search] OFF rate limit hit")
		c.Header("Retry-After", "60")
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests — wait a moment and try again"})
		return
	case status >= 500:
		log.Printf("[food/search] OFF upstream error: %d", status)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "food search temporarily unavailable"})
		return
	case status != 200:
		log.Printf("[food/search] OFF unexpected status: %d", status)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "food search temporarily unavailable"})
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
	Status  int        `json:"status"`
	Product offProduct `json:"product"`
}

func LookupBarcode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		utils.BadRequest(c, "barcode is required")
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
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "barcode lookup timed out — try again"})
			return
		}
		log.Printf("[food/barcode] OFF network error: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "could not reach food database"})
		return
	}

	switch {
	case status == 429:
		log.Printf("[food/barcode] OFF rate limit hit")
		c.Header("Retry-After", "60")
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests — wait a moment and try again"})
		return
	case status >= 500:
		log.Printf("[food/barcode] OFF upstream error: %d", status)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "barcode lookup temporarily unavailable"})
		return
	}

	var parsed offBarcodeResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("[food/barcode] OFF parse error: %v", err)
		utils.InternalError(c)
		return
	}

	if parsed.Status != 1 || parsed.Product.ProductName == "" {
		utils.NotFound(c, "product not found")
		return
	}

	utils.OK(c, offProductToResult(parsed.Product))
}

// ─── Saved Foods ──────────────────────────────────────────────────────────────

func ListSavedFoods(c *gin.Context) {
	uid := middleware.UserID(c)

	rows, err := db.DB.Query(
		`SELECT id, user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode, created_at
		 FROM saved_foods WHERE user_id = ? ORDER BY name ASC`,
		uid,
	)
	if err != nil {
		log.Printf("[food/saved/list] db error: %v", err)
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	foods := []models.SavedFood{}
	for rows.Next() {
		var f models.SavedFood
		rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Brand, &f.Calories, &f.Protein, &f.Carbs, &f.Fat,
			&f.Fiber, &f.ServingSize, &f.Barcode, &f.CreatedAt)
		foods = append(foods, f)
	}
	utils.OK(c, foods)
}

func CreateSavedFood(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.SaveFoodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	res, err := db.DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Brand, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.ServingSize, req.Barcode,
	)
	if err != nil {
		log.Printf("[food/saved/create] db error: %v", err)
		utils.InternalError(c)
		return
	}

	id, _ := res.LastInsertId()
	var f models.SavedFood
	db.DB.QueryRow(
		`SELECT id, user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode, created_at
		 FROM saved_foods WHERE id = ?`, id,
	).Scan(&f.ID, &f.UserID, &f.Name, &f.Brand, &f.Calories, &f.Protein, &f.Carbs, &f.Fat,
		&f.Fiber, &f.ServingSize, &f.Barcode, &f.CreatedAt)
	utils.Created(c, f)
}

func DeleteSavedFood(c *gin.Context) {
	uid := middleware.UserID(c)
	fid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM saved_foods WHERE id = ? AND user_id = ?`, fid, uid)
	if err != nil {
		log.Printf("[food/saved/delete] db error: %v", err)
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "saved food not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}
