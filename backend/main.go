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

// The whole shutdown sequence — drain, stop seeding, checkpoint — must fit inside the
// container runtime's grace period before SIGKILL. Compose's default is 10s and an
// existing self-hoster's docker-compose.yml has no stop_grace_period, so 8s leaves room
// for the process to exit on its own rather than being killed mid-checkpoint.
const shutdownBudget = 8 * time.Second

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
	// seed.Go, not a bare `go`: Stop can only wait for goroutines it knows about, and
	// DemoData is the long one it most needs to wait for.
	seed.Go("demo-data", func() { seed.DemoData(db.DB) })

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

	// Everything below has to finish inside compose's grace period — 10s by default, and
	// self-hosters running an older docker-compose.yml never get a stop_grace_period we
	// might add later. So budget the WHOLE sequence against one deadline rather than
	// three independent constants that quietly summed to 11s: drain, then stop seeding,
	// then checkpoint, each capped by what the previous step left behind.
	deadline := time.Now().Add(shutdownBudget)

	drainBy := time.Now().Add(4 * time.Second)
	if drainBy.After(deadline) {
		drainBy = deadline
	}
	ctx, cancel := context.WithDeadline(context.Background(), drainBy)
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown timed out, closing anyway: %v", err)
	}
	cancel()

	// Seeding is not HTTP work, so srv.Shutdown does not wait for it — and DemoData
	// writes through many separate statements with no transaction around them. Left
	// running, it can keep inserting after db.Close has checkpointed, into a WAL that
	// nothing will fold in before the process exits. Stop it first.
	seedBudget := 2 * time.Second
	if remaining := time.Until(deadline); remaining < seedBudget {
		seedBudget = remaining
	}
	seed.Stop(seedBudget)

	db.CloseBy(deadline)

	if exitCode != 0 {
		os.Exit(exitCode)
	}
}
