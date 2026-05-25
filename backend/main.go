package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/routes"
	"github.com/Cawlumm/lyftr-backend/seed"
	"github.com/gin-gonic/gin"
)

func main() {
	showVersion := flag.Bool("version", false, "print the build version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Printf("lyftr %s\n", config.Version())
		os.Exit(0)
	}

	config.Load()
	db.Connect()
	seed.DemoUser(db.DB)
	seed.Exercises(db.DB)
	go seed.DemoData(db.DB)

	if config.C.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	routes.Setup(r)

	addr := ":" + config.C.Port
	log.Printf("lyftr API listening on %s (env=%s)", addr, config.C.Env)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
