#!/usr/bin/env python3
"""Plot Pacejka tire force curves.

This example demonstrates:
- Creating different tire configurations
- Plotting lateral and longitudinal force curves
- Visualizing how load affects tire performance

Run with: python examples/tire_curves.py
"""

import sys
import os

# Add parent directory to path for development
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    """Plot tire curves."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("This example requires matplotlib. Install with: pip install matplotlib")
        return 1

    from physicskit.tire.pacejka import PacejkaFormula, PacejkaParams
    from physicskit.visualization.plotter import TirePlotter

    print("Pacejka Tire Force Curves")
    print("=" * 40)

    # Create different tire configurations
    tires = {
        "Sport": PacejkaParams.sport_tire(),
        "Drift": PacejkaParams.drift_tire(),
        "Rain": PacejkaParams.rain_tire(),
    }

    loads = [2000, 4000, 6000]  # Newtons

    # Create figure with subplots
    fig, axes = plt.subplots(len(tires), 2, figsize=(14, 4 * len(tires)))

    for i, (name, params) in enumerate(tires.items()):
        pacejka = PacejkaFormula(params)

        # Lateral force
        ax_lat = axes[i, 0]
        TirePlotter.plot_lateral_force(pacejka, loads, ax=ax_lat)
        ax_lat.set_title(f'{name} Tire - Lateral Force')

        # Longitudinal force
        ax_long = axes[i, 1]
        TirePlotter.plot_longitudinal_force(pacejka, loads, ax=ax_long)
        ax_long.set_title(f'{name} Tire - Longitudinal Force')

    fig.suptitle('Pacejka Magic Formula - Tire Force Curves', fontsize=14)
    plt.tight_layout()

    # Show or save
    if len(sys.argv) > 1 and sys.argv[1] == '--save':
        output_file = 'tire_curves.png'
        plt.savefig(output_file, dpi=150)
        print(f"Saved to: {output_file}")
    else:
        print("Displaying plot. Close window to exit.")
        plt.show()

    return 0


if __name__ == "__main__":
    sys.exit(main())
