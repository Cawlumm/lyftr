package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/routes"
	"github.com/Cawlumm/lyftr-backend/seed"
	"github.com/Cawlumm/lyftr-backend/stores"
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
	// The demo account's credentials are published, so it is not something a self-hosted
	// instance should get by default — only the public demo and local development ask for
	// it. The exercise library is not demo data and always seeds.
	if config.C.DemoMode {
		seed.DemoUser(db.DB)
	} else {
		seed.WarnLeftoverDemoUser(db.DB)
	}
	seed.Exercises(db.DB)
	if config.C.DemoMode {
		go seed.DemoData(db.DB)
	}

	if config.C.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	s := stores.New(db.DB)
	h := controllers.NewHandler(s)
	routes.Setup(r, h)

	addr := ":" + config.C.Port
	log.Printf("lyftr API listening on %s (env=%s)", addr, config.C.Env)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
