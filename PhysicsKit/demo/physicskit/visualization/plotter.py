"""Matplotlib-based plotting for tire curves and trajectories.

Provides static plots for:
- Tire force curves (Pacejka)
- Friction ellipse visualization
- Vehicle trajectory
- Telemetry over time
"""

from __future__ import annotations
from typing import TYPE_CHECKING, List, Tuple, Optional

import numpy as np

try:
    import matplotlib.pyplot as plt
    from matplotlib.patches import Ellipse
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False

if TYPE_CHECKING:
    from physicskit.tire.pacejka import PacejkaFormula


def _check_matplotlib():
    """Check if matplotlib is available."""
    if not MATPLOTLIB_AVAILABLE:
        raise ImportError(
            "Matplotlib is required for plotting. "
            "Install it with: pip install matplotlib"
        )


class TirePlotter:
    """Plot tire force curves and characteristics."""

    @staticmethod
    def plot_lateral_force(
        pacejka: PacejkaFormula,
        loads: Optional[List[float]] = None,
        slip_range: Tuple[float, float] = (-20, 20),
        ax: Optional[plt.Axes] = None
    ) -> plt.Figure:
        """Plot lateral force vs slip angle.

        Args:
            pacejka: Pacejka formula instance
            loads: List of vertical loads to plot (N). Defaults to [2000, 4000, 6000, 8000]
            slip_range: Range of slip angles (degrees)
            ax: Optional axes to plot on

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        if loads is None:
            loads = [2000, 4000, 6000, 8000]

        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 6))
        else:
            fig = ax.figure

        slip_angles = np.linspace(slip_range[0], slip_range[1], 200)

        for Fz in loads:
            forces = [pacejka.lateral_force(a, Fz) for a in slip_angles]
            ax.plot(slip_angles, forces, label=f'{Fz:.0f} N')

        ax.set_xlabel('Slip Angle (degrees)')
        ax.set_ylabel('Lateral Force (N)')
        ax.set_title('Pacejka Lateral Force vs Slip Angle')
        ax.legend(title='Vertical Load')
        ax.grid(True, alpha=0.3)
        ax.axhline(y=0, color='k', linewidth=0.5)
        ax.axvline(x=0, color='k', linewidth=0.5)

        return fig

    @staticmethod
    def plot_longitudinal_force(
        pacejka: PacejkaFormula,
        loads: Optional[List[float]] = None,
        slip_range: Tuple[float, float] = (-1, 1),
        ax: Optional[plt.Axes] = None
    ) -> plt.Figure:
        """Plot longitudinal force vs slip ratio.

        Args:
            pacejka: Pacejka formula instance
            loads: List of vertical loads to plot (N)
            slip_range: Range of slip ratios
            ax: Optional axes to plot on

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        if loads is None:
            loads = [2000, 4000, 6000, 8000]

        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 6))
        else:
            fig = ax.figure

        slip_ratios = np.linspace(slip_range[0], slip_range[1], 200)

        for Fz in loads:
            forces = [pacejka.longitudinal_force(sr, Fz) for sr in slip_ratios]
            ax.plot(slip_ratios * 100, forces, label=f'{Fz:.0f} N')

        ax.set_xlabel('Slip Ratio (%)')
        ax.set_ylabel('Longitudinal Force (N)')
        ax.set_title('Pacejka Longitudinal Force vs Slip Ratio')
        ax.legend(title='Vertical Load')
        ax.grid(True, alpha=0.3)
        ax.axhline(y=0, color='k', linewidth=0.5)
        ax.axvline(x=0, color='k', linewidth=0.5)

        return fig

    @staticmethod
    def plot_friction_ellipse(
        Fx_max: float,
        Fy_max: float,
        Fx_actual: float = 0,
        Fy_actual: float = 0,
        ax: Optional[plt.Axes] = None
    ) -> plt.Figure:
        """Plot friction ellipse with current force point.

        Args:
            Fx_max: Maximum longitudinal force
            Fy_max: Maximum lateral force
            Fx_actual: Current longitudinal force
            Fy_actual: Current lateral force
            ax: Optional axes to plot on

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        if ax is None:
            fig, ax = plt.subplots(figsize=(8, 8))
        else:
            fig = ax.figure

        # Draw friction ellipse
        ellipse = Ellipse(
            (0, 0), Fx_max * 2, Fy_max * 2,
            fill=False, color='blue', linewidth=2, label='Friction Limit'
        )
        ax.add_patch(ellipse)

        # Draw current force point
        ax.plot(Fx_actual, Fy_actual, 'ro', markersize=10, label='Current Force')
        ax.plot([0, Fx_actual], [0, Fy_actual], 'r-', linewidth=2)

        # Draw axes
        ax.axhline(y=0, color='k', linewidth=0.5)
        ax.axvline(x=0, color='k', linewidth=0.5)

        # Set equal aspect and limits
        max_val = max(Fx_max, Fy_max) * 1.2
        ax.set_xlim(-max_val, max_val)
        ax.set_ylim(-max_val, max_val)
        ax.set_aspect('equal')

        ax.set_xlabel('Longitudinal Force (N)')
        ax.set_ylabel('Lateral Force (N)')
        ax.set_title('Friction Ellipse')
        ax.legend()
        ax.grid(True, alpha=0.3)

        return fig

    @staticmethod
    def plot_combined_curves(
        pacejka: PacejkaFormula,
        Fz: float = 4000,
        figsize: Tuple[float, float] = (12, 5)
    ) -> plt.Figure:
        """Plot both lateral and longitudinal curves side by side.

        Args:
            pacejka: Pacejka formula instance
            Fz: Vertical load for curves
            figsize: Figure size

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)

        TirePlotter.plot_lateral_force(pacejka, [Fz], ax=ax1)
        TirePlotter.plot_longitudinal_force(pacejka, [Fz], ax=ax2)

        fig.suptitle(f'Tire Force Curves at {Fz:.0f} N Load')
        fig.tight_layout()

        return fig


class TrajectoryPlotter:
    """Plot vehicle trajectory and telemetry."""

    @staticmethod
    def plot_trajectory(
        positions: List[Tuple[float, float]],
        headings: Optional[List[float]] = None,
        ax: Optional[plt.Axes] = None,
        show_direction: bool = True,
        marker_interval: int = 50
    ) -> plt.Figure:
        """Plot vehicle trajectory path.

        Args:
            positions: List of (x, y) positions
            headings: Optional list of heading angles (radians)
            ax: Optional axes to plot on
            show_direction: Show direction markers
            marker_interval: Interval between direction markers

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 10))
        else:
            fig = ax.figure

        if not positions:
            return fig

        x = [p[0] for p in positions]
        y = [p[1] for p in positions]

        # Plot path
        ax.plot(x, y, 'b-', linewidth=1.5, alpha=0.7)

        # Start and end markers
        ax.plot(x[0], y[0], 'go', markersize=10, label='Start')
        ax.plot(x[-1], y[-1], 'rs', markersize=10, label='End')

        # Direction markers
        if show_direction and headings and len(headings) == len(positions):
            for i in range(0, len(positions), marker_interval):
                px, py = positions[i]
                heading = headings[i]
                dx = np.cos(heading) * 2
                dy = np.sin(heading) * 2
                ax.arrow(px, py, dx, dy, head_width=0.5, head_length=0.3,
                        fc='red', ec='red', alpha=0.5)

        ax.set_xlabel('X (meters)')
        ax.set_ylabel('Y (meters)')
        ax.set_title('Vehicle Trajectory')
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')

        return fig

    @staticmethod
    def plot_telemetry(
        time: List[float],
        speed: List[float],
        drift_angle: List[float],
        throttle: List[float],
        steer: List[float],
        figsize: Tuple[float, float] = (12, 8)
    ) -> plt.Figure:
        """Plot telemetry over time.

        Args:
            time: Time values (seconds)
            speed: Speed values (m/s)
            drift_angle: Drift angle values (degrees)
            throttle: Throttle values (0-1)
            steer: Steering values (-1 to 1)
            figsize: Figure size

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        fig, axes = plt.subplots(4, 1, figsize=figsize, sharex=True)

        # Speed
        axes[0].plot(time, [s * 3.6 for s in speed], 'b-')
        axes[0].set_ylabel('Speed (km/h)')
        axes[0].grid(True, alpha=0.3)

        # Drift angle
        axes[1].plot(time, drift_angle, 'r-')
        axes[1].set_ylabel('Drift Angle (°)')
        axes[1].axhline(y=0, color='k', linewidth=0.5)
        axes[1].grid(True, alpha=0.3)

        # Throttle
        axes[2].plot(time, [t * 100 for t in throttle], 'g-')
        axes[2].set_ylabel('Throttle (%)')
        axes[2].set_ylim(-5, 105)
        axes[2].grid(True, alpha=0.3)

        # Steering
        axes[3].plot(time, [s * 100 for s in steer], 'm-')
        axes[3].set_ylabel('Steering (%)')
        axes[3].set_ylim(-105, 105)
        axes[3].axhline(y=0, color='k', linewidth=0.5)
        axes[3].grid(True, alpha=0.3)

        axes[3].set_xlabel('Time (seconds)')
        fig.suptitle('Telemetry')
        fig.tight_layout()

        return fig

    @staticmethod
    def plot_drift_metrics(
        time: List[float],
        drift_angle: List[float],
        drift_score: List[float],
        is_drifting: List[bool],
        figsize: Tuple[float, float] = (12, 6)
    ) -> plt.Figure:
        """Plot drift-specific metrics.

        Args:
            time: Time values
            drift_angle: Drift angle values
            drift_score: Score values
            is_drifting: Boolean drift state
            figsize: Figure size

        Returns:
            Matplotlib figure
        """
        _check_matplotlib()

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=figsize, sharex=True)

        # Drift angle with drifting regions highlighted
        ax1.plot(time, drift_angle, 'b-', label='Drift Angle')

        # Highlight drifting regions
        drifting_start = None
        for i, (t, d) in enumerate(zip(time, is_drifting)):
            if d and drifting_start is None:
                drifting_start = t
            elif not d and drifting_start is not None:
                ax1.axvspan(drifting_start, t, alpha=0.2, color='yellow')
                drifting_start = None
        if drifting_start is not None:
            ax1.axvspan(drifting_start, time[-1], alpha=0.2, color='yellow')

        ax1.set_ylabel('Drift Angle (°)')
        ax1.axhline(y=0, color='k', linewidth=0.5)
        ax1.axhline(y=10, color='r', linewidth=0.5, linestyle='--', label='Drift Threshold')
        ax1.axhline(y=-10, color='r', linewidth=0.5, linestyle='--')
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        # Drift score
        ax2.plot(time, drift_score, 'g-')
        ax2.set_ylabel('Drift Score')
        ax2.set_xlabel('Time (seconds)')
        ax2.set_ylim(0, 105)
        ax2.grid(True, alpha=0.3)

        fig.suptitle('Drift Analysis')
        fig.tight_layout()

        return fig
