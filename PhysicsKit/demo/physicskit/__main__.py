"""CLI entry point for PhysicsKit.

Run with: python -m physicskit [command]

Commands:
    drift     - Run drift simulation demo
    plot      - Plot tire curves
    info      - Show available presets
"""

import sys
import argparse


def run_drift_demo(args):
    """Run the drift simulation demo."""
    try:
        from physicskit.visualization import PygameRenderer
    except ImportError:
        print("Error: Pygame is required for the drift demo.")
        print("Install it with: pip install pygame")
        return 1

    from physicskit.core.world import World
    from physicskit.vehicle.car import Car
    from physicskit.config.vehicle_presets import get_vehicle_config
    from physicskit.drift.metrics import DriftAnalyzer

    print("PhysicsKit Drift Demo")
    print("=" * 40)
    print(f"Vehicle: {args.vehicle}")
    print()
    print("Controls:")
    print("  W/↑     - Throttle")
    print("  S/↓     - Brake")
    print("  A/D     - Steer")
    print("  Space   - Handbrake")
    print("  R       - Reset")
    print("  F       - Toggle forces")
    print("  T       - Toggle telemetry")
    print("  Esc     - Quit")
    print()

    # Create simulation
    try:
        config = get_vehicle_config(args.vehicle)
    except ValueError as e:
        print(f"Error: {e}")
        return 1

    world = World(dt=0.001)
    car = Car(config)
    world.add_vehicle(car)

    # Set initial velocity if specified
    if args.speed > 0:
        car.set_velocity(args.speed / 3.6)  # Convert km/h to m/s

    # Create renderer and analyzer
    renderer = PygameRenderer()
    drift_analyzer = DriftAnalyzer()

    print("Starting simulation...")
    sim_time = 0.0

    try:
        while True:
            # Handle input
            inputs = renderer.handle_input()

            if inputs.get('quit'):
                break

            if inputs.get('reset'):
                car.reset()
                drift_analyzer.reset()
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

            # Step simulation
            dt = 1 / 60  # Target 60 FPS
            steps = world.step_fixed(dt)
            sim_time += dt

            # Update drift analysis
            state = car.get_state()
            drift_metrics = drift_analyzer.update(
                velocity=state.velocity,
                orientation=state.orientation,
                steer_angle_deg=state.steer * 35,  # Approximate
                throttle=state.throttle,
                yaw_rate=state.angular_velocity,
                speed=state.speed,
                dt=dt,
                sim_time=sim_time
            )

            # Render
            renderer.render(car, drift_metrics, fps=60)

    except KeyboardInterrupt:
        pass
    finally:
        renderer.quit()

    print("Simulation ended.")
    return 0


def plot_tires(args):
    """Plot tire force curves."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("Error: Matplotlib is required for plotting.")
        print("Install it with: pip install matplotlib")
        return 1

    from physicskit.tire.pacejka import PacejkaFormula, PacejkaParams
    from physicskit.visualization.plotter import TirePlotter

    print(f"Plotting tire curves for: {args.tire}")

    if args.tire == "sport":
        params = PacejkaParams.sport_tire()
    elif args.tire == "drift":
        params = PacejkaParams.drift_tire()
    elif args.tire == "rain":
        params = PacejkaParams.rain_tire()
    else:
        print(f"Unknown tire type: {args.tire}")
        return 1

    pacejka = PacejkaFormula(params)

    # Create plots
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    loads = [2000, 4000, 6000, 8000]

    TirePlotter.plot_lateral_force(pacejka, loads, ax=ax1)
    TirePlotter.plot_longitudinal_force(pacejka, loads, ax=ax2)

    fig.suptitle(f'{args.tire.title()} Tire Force Curves')
    plt.tight_layout()

    if args.output:
        plt.savefig(args.output, dpi=150)
        print(f"Saved to: {args.output}")
    else:
        plt.show()

    return 0


def show_info(args):
    """Show available presets and information."""
    from physicskit import __version__
    from physicskit.config.tire_presets import TIRE_PRESETS
    from physicskit.config.vehicle_presets import VEHICLE_PRESETS

    print(f"PhysicsKit v{__version__}")
    print("=" * 40)
    print()

    print("Vehicle Presets:")
    print("-" * 30)
    for name, info in VEHICLE_PRESETS.items():
        print(f"  {name:15} - {info['description']}")
    print()

    print("Tire Presets:")
    print("-" * 30)
    for name, info in TIRE_PRESETS.items():
        print(f"  {name:15} - {info['description']}")
    print()

    return 0


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="PhysicsKit - Multi-body physics simulation with non-linear tire physics",
        prog="physicskit"
    )
    parser.add_argument(
        "--version", action="version",
        version="%(prog)s 0.1.0"
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Drift demo command
    drift_parser = subparsers.add_parser("drift", help="Run drift simulation demo")
    drift_parser.add_argument(
        "-v", "--vehicle",
        default="drift_car",
        help="Vehicle preset to use (default: drift_car)"
    )
    drift_parser.add_argument(
        "-s", "--speed",
        type=float, default=0,
        help="Initial speed in km/h (default: 0)"
    )

    # Plot command
    plot_parser = subparsers.add_parser("plot", help="Plot tire curves")
    plot_parser.add_argument(
        "-t", "--tire",
        default="sport",
        choices=["sport", "drift", "rain"],
        help="Tire type to plot (default: sport)"
    )
    plot_parser.add_argument(
        "-o", "--output",
        help="Save plot to file instead of displaying"
    )

    # Info command
    subparsers.add_parser("info", help="Show available presets")

    args = parser.parse_args()

    if args.command == "drift":
        return run_drift_demo(args)
    elif args.command == "plot":
        return plot_tires(args)
    elif args.command == "info":
        return show_info(args)
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
