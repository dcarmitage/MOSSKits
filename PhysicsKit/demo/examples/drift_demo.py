#!/usr/bin/env python3
"""Drift simulation demo.

This example demonstrates:
- Setting up a drift-tuned vehicle
- Running the physics simulation
- Using the Pygame renderer for visualization
- Tracking drift metrics

Run with: python examples/drift_demo.py
"""

import sys
import os

# Add parent directory to path for development
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physicskit.core.world import World
from physicskit.vehicle.car import Car, CarConfig
from physicskit.drift.metrics import DriftAnalyzer
from physicskit.drift.detection import DriftDetector


def main():
    """Run drift simulation demo."""
    # Check for pygame
    try:
        from physicskit.visualization import PygameRenderer
    except ImportError:
        print("This demo requires pygame. Install with: pip install pygame")
        return 1

    print("PhysicsKit Drift Demo")
    print("=" * 40)
    print()
    print("Controls:")
    print("  W/↑     - Throttle")
    print("  S/↓     - Brake")
    print("  A/D     - Steer left/right")
    print("  Space   - Handbrake (use to initiate drifts)")
    print("  R       - Reset vehicle")
    print("  F       - Toggle force vectors")
    print("  T       - Toggle telemetry")
    print("  C       - Toggle camera follow")
    print("  Esc     - Quit")
    print()
    print("Drift Tips:")
    print("  1. Build up speed (W)")
    print("  2. Steer into corner")
    print("  3. Pull handbrake briefly (Space)")
    print("  4. Counter-steer to maintain drift")
    print("  5. Modulate throttle to control angle")
    print()

    # Create drift-tuned car
    config = CarConfig.drift()
    car = Car(config)

    # Create simulation world
    world = World(dt=0.001)  # 1ms timestep
    world.add_vehicle(car)

    # Give initial speed
    car.set_velocity(15.0)  # 54 km/h

    # Create renderer
    renderer = PygameRenderer()
    renderer.init()

    # Create drift analyzer
    drift_analyzer = DriftAnalyzer()
    drift_detector = DriftDetector()

    print("Starting simulation...")
    sim_time = 0.0
    running = True

    try:
        while running:
            # Process input
            inputs = renderer.handle_input()

            if inputs.get('quit'):
                running = False
                continue

            if inputs.get('reset'):
                car.reset()
                car.set_velocity(15.0)
                drift_analyzer.reset()
                drift_detector.reset()
                renderer.clear_trail()
                sim_time = 0.0
                continue

            # Set car inputs
            car.set_inputs(
                throttle=inputs['throttle'],
                brake=inputs['brake'],
                steer=inputs['steer'],
                handbrake=inputs['handbrake']
            )

            # Step physics
            dt = 1 / 60  # 60 FPS target
            steps = world.step_fixed(dt)
            sim_time += dt

            # Get car state for drift analysis
            state = car.get_state()

            # Update drift metrics
            drift_metrics = drift_analyzer.update(
                velocity=state.velocity,
                orientation=state.orientation,
                steer_angle_deg=state.steer * 35,
                throttle=state.throttle,
                yaw_rate=state.angular_velocity,
                speed=state.speed,
                dt=dt,
                sim_time=sim_time
            )

            # Update drift detection
            from physicskit.vehicle.suspension import WheelPosition
            detection = drift_detector.update(
                drift_angle=drift_metrics.drift_angle,
                drift_angle_rate=drift_metrics.drift_angle_rate,
                speed=state.speed,
                throttle=state.throttle,
                brake=state.brake,
                steer=state.steer,
                handbrake=state.handbrake,
                rear_slip_L=state.tire_RL.slip_angle_deg,
                rear_slip_R=state.tire_RR.slip_angle_deg,
                front_slip_L=state.tire_FL.slip_angle_deg,
                front_slip_R=state.tire_FR.slip_angle_deg,
                sim_time=sim_time
            )

            # Render
            renderer.render(car, drift_metrics, fps=60)

            # Print drift state changes
            if drift_detector.is_drifting and not hasattr(main, '_was_drifting'):
                print(f"Drift started! ({detection.initiation.value})")
                main._was_drifting = True
            elif not drift_detector.is_drifting and getattr(main, '_was_drifting', False):
                print(f"Drift ended. Score: {drift_metrics.overall_score:.0f}")
                main._was_drifting = False

    except KeyboardInterrupt:
        pass
    finally:
        renderer.quit()

    print("\nSimulation ended.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
