#!/usr/bin/env python3
"""Seed food logs for demo account via API. Run with: python scripts/seed_food.py"""

import json
import urllib.request
import urllib.error
from datetime import date, timedelta

BASE = "http://localhost:3000/api/v1"
EMAIL = "demo@lyftr.local"
PASSWORD = "password123"

MEAL_ROTATION = [
    [
        {"meal": "breakfast", "name": "Eggs, oats and banana",                          "calories": 520, "protein": 38, "carbs": 62, "fat": 12, "fiber": 6},
        {"meal": "lunch",     "name": "Chicken breast with rice and broccoli",           "calories": 640, "protein": 55, "carbs": 70, "fat":  8, "fiber": 5},
        {"meal": "dinner",    "name": "Salmon with sweet potato and asparagus",           "calories": 590, "protein": 48, "carbs": 48, "fat": 16, "fiber": 7},
        {"meal": "snacks",    "name": "Greek yogurt and protein shake",                   "calories": 370, "protein": 52, "carbs": 28, "fat":  6, "fiber": 2},
    ],
    [
        {"meal": "breakfast", "name": "Protein oats with blueberries",                   "calories": 490, "protein": 35, "carbs": 65, "fat":  9, "fiber": 8},
        {"meal": "lunch",     "name": "Turkey and avocado wrap",                          "calories": 610, "protein": 46, "carbs": 58, "fat": 18, "fiber": 6},
        {"meal": "dinner",    "name": "Lean ground beef with pasta and marinara",         "calories": 680, "protein": 52, "carbs": 72, "fat": 14, "fiber": 5},
        {"meal": "snacks",    "name": "Cottage cheese and almonds",                       "calories": 330, "protein": 38, "carbs": 14, "fat": 16, "fiber": 2},
    ],
    [
        {"meal": "breakfast", "name": "Scrambled eggs with whole-wheat toast",            "calories": 480, "protein": 34, "carbs": 48, "fat": 15, "fiber": 4},
        {"meal": "lunch",     "name": "Tuna salad with quinoa",                           "calories": 570, "protein": 50, "carbs": 52, "fat": 12, "fiber": 5},
        {"meal": "dinner",    "name": "Grilled chicken thighs with roasted veg",          "calories": 620, "protein": 54, "carbs": 38, "fat": 22, "fiber": 8},
        {"meal": "snacks",    "name": "Protein shake with banana",                        "calories": 340, "protein": 40, "carbs": 40, "fat":  4, "fiber": 3},
    ],
    [
        {"meal": "breakfast", "name": "Overnight oats with chia and honey",               "calories": 510, "protein": 30, "carbs": 70, "fat": 11, "fiber": 9},
        {"meal": "lunch",     "name": "Greek salad with grilled chicken",                  "calories": 520, "protein": 48, "carbs": 22, "fat": 20, "fiber": 4},
        {"meal": "dinner",    "name": "Beef stir-fry with brown rice",                    "calories": 660, "protein": 50, "carbs": 68, "fat": 16, "fiber": 6},
        {"meal": "snacks",    "name": "Rice cakes with peanut butter",                    "calories": 290, "protein": 10, "carbs": 38, "fat": 12, "fiber": 3},
    ],
    [
        {"meal": "breakfast", "name": "Smoothie bowl with granola",                       "calories": 460, "protein": 22, "carbs": 72, "fat":  8, "fiber": 7},
        {"meal": "lunch",     "name": "Shrimp tacos with slaw",                           "calories": 580, "protein": 44, "carbs": 60, "fat": 14, "fiber": 5},
        {"meal": "dinner",    "name": "Baked cod with mashed sweet potato",               "calories": 550, "protein": 46, "carbs": 52, "fat": 10, "fiber": 6},
        {"meal": "snacks",    "name": "Hard boiled eggs and apple",                       "calories": 250, "protein": 18, "carbs": 26, "fat": 10, "fiber": 4},
    ],
]


def post(path, data, token=None):
    body = json.dumps(data).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def main():
    print(f"Logging in as {EMAIL}…")
    resp = post("/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = resp["data"]["token"]
    print("Login OK")

    today = date.today()
    days = 60  # fill 60 days back
    logged = 0
    skipped = 0

    for offset in range(days, 0, -1):
        day = today - timedelta(days=offset)
        pattern = MEAL_ROTATION[offset % len(MEAL_ROTATION)]
        for meal in pattern:
            payload = {
                **meal,
                "servings": 1,
                "serving_size": "1 serving",
                "logged_at": f"{day.isoformat()}T12:00:00Z",
            }
            try:
                post("/food", payload, token=token)
                logged += 1
            except urllib.error.HTTPError as e:
                body = e.read().decode()
                print(f"  SKIP {day} {meal['meal']}: {e.code} {body[:80]}")
                skipped += 1

    print(f"\nDone — {logged} entries logged, {skipped} skipped")


if __name__ == "__main__":
    main()
