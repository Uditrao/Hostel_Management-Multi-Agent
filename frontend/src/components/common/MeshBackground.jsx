/**
 * MeshBackground.jsx
 * ==================
 * Interactive 3D Perspective Wireframe Grid & Autonomous Agent Constellation.
 * Built with HTML5 Canvas (zero heavy external 3D libraries needed).
 * Features:
 *  - 3D perspective undulating wireframe terrain / grid (infinite horizon in charcoal/slate/white)
 *  - Interactive cursor tracking (tilts the 3D plane and ripples nodes)
 *  - Constellation network representing the 5 AI agents communicating in real time
 *  - High performance 60fps render with devicePixelRatio awareness and auto-pause when hidden
 */
import { useEffect, useRef } from 'react'

export default function MeshBackground({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId
    let width = 0
    let height = 0
    let time = 0

    // Mouse coordinates smoothed for 3D tilt
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 }

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.parentElement?.clientWidth || window.innerWidth
      height = canvas.parentElement?.clientHeight || window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
    }

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / width - 0.5
      const y = (e.clientY - rect.top) / height - 0.5
      mouse.targetX = x * 2
      mouse.targetY = y * 2
    }

    const handleTouchMove = (e) => {
      if (!e.touches[0]) return
      const rect = canvas.getBoundingClientRect()
      const x = (e.touches[0].clientX - rect.left) / width - 0.5
      const y = (e.touches[0].clientY - rect.top) / height - 0.5
      mouse.targetX = x * 2
      mouse.targetY = y * 2
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    handleResize()

    // ── Floating Agent Nodes (Autonomous Constellation in 3D Space) ──────────
    const agentNodes = [
      { name: 'IRIS', code: 'AGT-01', x: 0.18, y: 0.28, vx: 0.0003, vy: -0.0002 },
      { name: 'SENTINEL', code: 'AGT-02', x: 0.82, y: 0.32, vx: -0.0002, vy: 0.0003 },
      { name: 'NOURISH', code: 'AGT-03', x: 0.28, y: 0.72, vx: 0.0002, vy: 0.0002 },
      { name: 'FIXR', code: 'AGT-04', x: 0.75, y: 0.68, vx: -0.0003, vy: -0.0002 },
      { name: 'HERALD', code: 'AGT-05 (ORCHESTRATOR)', x: 0.5, y: 0.45, vx: 0.0001, vy: -0.0001 },
    ]

    // ── Render Loop ─────────────────────────────────────────────────────────
    const render = () => {
      time += 0.015

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.05
      mouse.y += (mouse.targetY - mouse.y) * 0.05

      ctx.clearRect(0, 0, width, height)

      // 1. Subtle radial backdrop gradient
      const bgGrad = ctx.createRadialGradient(
        width * 0.5 + mouse.x * 60,
        height * 0.4 + mouse.y * 40,
        50,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      )
      bgGrad.addColorStop(0, '#151515')
      bgGrad.addColorStop(0.5, '#0b0b0b')
      bgGrad.addColorStop(1, '#050505')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // 2. 3D Perspective Undulating Wireframe Plane
      const cols = 26
      const rows = 18
      const horizonY = height * 0.28 + mouse.y * 30
      const groundH = height - horizonY
      const fov = 340

      // Calculate 3D projected vertices
      const grid = []
      for (let r = 0; r <= rows; r++) {
        grid[r] = []
        const progressZ = r / rows
        // Exponential depth factor
        const depth = Math.pow(progressZ, 1.7)
        const yBase = horizonY + depth * groundH

        for (let c = 0; c <= cols; c++) {
          const normX = c / cols - 0.5 // -0.5 to 0.5
          // Perspective spread
          const spread = (progressZ * 1.8 + 0.25) * width
          const x = width * 0.5 + normX * spread + mouse.x * (1 - progressZ) * 45

          // Wave elevation
          const wave1 = Math.sin(normX * 6 + time * 1.2 + progressZ * 4) * 18
          const wave2 = Math.cos(normX * 8 - time * 0.8 + progressZ * 5) * 12
          const y = yBase + (wave1 + wave2) * depth

          grid[r][c] = { x, y, depth }
        }
      }

      // Draw horizontal crosslines (latitudes)
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath()
        const alpha = Math.min(0.35, Math.pow(r / rows, 1.4) * 0.38)
        ctx.strokeStyle = `rgba(200, 200, 200, ${alpha})`
        ctx.lineWidth = r === rows ? 1.5 : 0.8

        for (let c = 0; c <= cols; c++) {
          const pt = grid[r][c]
          if (c === 0) ctx.moveTo(pt.x, pt.y)
          else ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
      }

      // Draw vertical longitudinal lines (rays vanishing to horizon)
      for (let c = 0; c <= cols; c++) {
        ctx.beginPath()
        const centerDist = Math.abs(c / cols - 0.5)
        const alpha = Math.max(0.04, (0.35 - centerDist * 0.3))
        ctx.strokeStyle = `rgba(180, 180, 180, ${alpha})`
        ctx.lineWidth = 0.8

        for (let r = 0; r <= rows; r++) {
          const pt = grid[r][c]
          if (r === 0) ctx.moveTo(pt.x, pt.y)
          else ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
      }

      // 3. Floating AI Agent Constellation with Real-time Data Packets
      const projectedAgents = agentNodes.map((node) => {
        // Floating drift
        node.x += node.vx
        node.y += node.vy
        if (node.x < 0.1 || node.x > 0.9) node.vx *= -1
        if (node.y < 0.15 || node.y > 0.85) node.vy *= -1

        const screenX = node.x * width + mouse.x * 25
        const screenY = node.y * height + mouse.y * 20
        return { ...node, sx: screenX, sy: screenY }
      })

      // Draw inter-agent communication laser filaments
      for (let i = 0; i < projectedAgents.length; i++) {
        for (let j = i + 1; j < projectedAgents.length; j++) {
          const a = projectedAgents[i]
          const b = projectedAgents[j]
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy)
          const maxDist = width * 0.55

          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.28
            ctx.beginPath()
            ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha})`
            ctx.lineWidth = 0.8
            ctx.setLineDash([4, 6])
            ctx.moveTo(a.sx, a.sy)
            ctx.lineTo(b.sx, b.sy)
            ctx.stroke()
            ctx.setLineDash([])

            // Moving data packets along lines
            const packetPos = (time * 0.8 + i * 0.3) % 1
            const px = a.sx + (b.sx - a.sx) * packetPos
            const py = a.sy + (b.sy - a.sy) * packetPos
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(px - 1.5, py - 1.5, 3, 3)
          }
        }
      }

      // Draw Agent Node Reticles
      projectedAgents.forEach((node) => {
        // Pulse ring
        const pulse = (Math.sin(time * 3 + node.x * 10) + 1) * 0.5
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + pulse * 0.25})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(node.sx, node.sy, 12 + pulse * 4, 0, Math.PI * 2)
        ctx.stroke()

        // Center diamond
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(node.sx, node.sy, 2.5, 0, Math.PI * 2)
        ctx.fill()

        // Monospaced Callout Label
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
        ctx.fillText(node.name, node.sx + 16, node.sy - 4)

        ctx.font = '8px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(150, 150, 150, 0.65)'
        ctx.fillText(node.code, node.sx + 16, node.sy + 6)
      })

      // 4. Subtle Top/Bottom Vignette to seamlessly blend with header & sections
      const topVignette = ctx.createLinearGradient(0, 0, 0, 120)
      topVignette.addColorStop(0, 'rgba(8, 8, 8, 0.95)')
      topVignette.addColorStop(1, 'rgba(8, 8, 8, 0)')
      ctx.fillStyle = topVignette
      ctx.fillRect(0, 0, width, 120)

      const bottomVignette = ctx.createLinearGradient(0, height - 140, 0, height)
      bottomVignette.addColorStop(0, 'rgba(8, 8, 8, 0)')
      bottomVignette.addColorStop(1, 'rgba(8, 8, 8, 0.98)')
      ctx.fillStyle = bottomVignette
      ctx.fillRect(0, height - 140, width, 140)

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
