export function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    // The Fox 40 is a pealess whistle that relies on three tuned chambers 
    // to create an intense, piercing sound with a natural trill.
    const f1 = 2850 // Chamber 1
    const f2 = 3100 // Chamber 2
    const f3 = 3300 // Chamber 3 (interferes with 2 to create a trill)

    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0, ctx.currentTime)
    // Short, crisp, sudden chirp for a faceoff
    masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02)
    masterGain.gain.setValueAtTime(1, ctx.currentTime + 0.15)
    masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    masterGain.connect(ctx.destination)

    const createChamber = (freq: number) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle' // Triangle wave provides a bit more harshness than sine
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      
      // Slight pitch bend up at the very beginning to simulate the initial air blast
      osc.frequency.exponentialRampToValueAtTime(freq + 100, ctx.currentTime + 0.05)
      osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.1)

      osc.connect(masterGain)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
      return osc
    }

    createChamber(f1)
    createChamber(f2)
    createChamber(f3)

  } catch (e) {
    console.error("Audio playback failed", e)
  }
}
