package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	seed.DemoUser(db.DB)
	seed.Exercises(db.DB)
	go seed.DemoData(db.DB)

	if config.C.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	s := stores.New(db.DB)
	h := controllers.NewHandler(s)
	routes.Setup(r, h)

	addr := ":" + config.C.Port
	srv := &http.Server{Addr: addr, Handler: r}

	// `docker compose down` sends SIGTERM. gin's r.Run() ignores it, so the process
	// was killed with the SQLite WAL un-checkpointed — see db.Close for why that
	// silently truncated people's backups.
	go func() {
		log.Printf("lyftr API listening on %s (env=%s)", addr, config.C.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	// Compose's default grace period before SIGKILL is 10s; finish inside it, and
	// leave room for the checkpoint afterwards.
	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	db.Close()
}
