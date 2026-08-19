package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/oedb"
	"github.com/Cawlumm/lyftr-backend/routes"
	"github.com/Cawlumm/lyftr-backend/seed"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
)

// warnIfUnclaimed says out loud, on every start, that first-user mode currently has the
// door open.
//
// first-user keys on the users table being empty, and that table lives on the data
// volume — so a volume that failed to mount, or a `docker compose up` from the wrong
// directory (which silently creates an empty ./data), is indistinguishable from a fresh
// install and re-opens registration. Immich shipped the same shape and had exactly this
// reported: immich-app/immich#24479, a reboot before the disk was mounted let anyone
// register as admin.
//
// Nothing stored in the database can guard against it, because any marker we wrote would
// be missing for the same reason. Only REGISTRATION=closed survives a missing volume,
// which is why the docs treat first-user as a setup mode rather than a resting state.
// What is left is to make the open door visible in the logs instead of silent.
func warnIfUnclaimed() {
	if config.C.Registration != config.RegistrationFirstUser {
		return
	}
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil || n > 0 {
		return
	}
	log.Print("NOTICE: REGISTRATION=first-user and no accounts exist yet — registration is " +
		"OPEN until the first one is created. If this instance already had an account, its " +
		"data volume is not mounted: stop it before someone else claims it.")
}

func main() {
	showVersion := flag.Bool("version", false, "print the build version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Printf("lyftr %s\n", config.Version())
		os.Exit(0)
	}

	config.Load()
	db.Connect()
	warnIfUnclaimed()
	// The demo account's credentials are published, so it is not something a self-hosted
	// instance should get by default — only the public demo and local development ask for
	if config.C.DemoMode {
		seed.DemoUser(db.DB)
	} else {
		seed.WarnLeftoverDemoUser(db.DB)
	}
	// Lyftr does not seed or mirror an exercise library. open-exercise-db is the
	// source, queried live; the local exercises table is filled only as a
	// side-effect of reads, so a fresh instance starts with an empty one and is
	// fully functional.
	s := stores.New(db.DB)
	s.Exercise.UseCatalog(oedb.New(config.C.OEDBBaseURL, config.Version()))

	if config.C.DemoMode {
		go seed.DemoData(db.DB, s.Exercise)
	}

	if config.C.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	h := controllers.NewHandler(s)
	routes.Setup(r, h)

	addr := ":" + config.C.Port
	log.Printf("lyftr API listening on %s (env=%s)", addr, config.C.Env)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
