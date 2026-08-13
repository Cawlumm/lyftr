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
	//
	// The listen error comes back on a channel rather than through log.Fatalf: Fatalf
	// is os.Exit, which skips every defer and the checkpoint below. Connect() has
	// already run the migrations by this point, so exiting that way on something as
	// ordinary as "port already in use" would strand those schema writes in the -wal.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("lyftr API listening on %s (env=%s)", addr, config.C.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	exitCode := 0
	select {
	case sig := <-stop:
		log.Printf("received %s, shutting down", sig)
	case err := <-serverErr:
		log.Printf("server error: %v", err)
		exitCode = 1
	}

	// Restore the default signal disposition so a second Ctrl-C kills the process.
	// Without this the operator has no escape hatch if the drain below wedges:
	// signal.Notify has disabled the default handler and nobody reads `stop` again.
	signal.Stop(stop)

	// Compose's default grace period before SIGKILL is 10s. Split it: up to 5s to
	// drain in-flight requests, and db.Close gets the remainder for the checkpoint.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown timed out, closing anyway: %v", err)
	}
	db.Close()

	if exitCode != 0 {
		os.Exit(exitCode)
	}
}
