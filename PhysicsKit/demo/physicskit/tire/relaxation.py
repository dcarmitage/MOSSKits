"""Tire relaxation length dynamics.

Real tires don't instantly generate their steady-state forces. There's a
time delay as the contact patch deforms and tread elements build up slip.
This is modeled as a first-order lag with a characteristic "relaxation length"
- the distance the tire must travel for the force to reach ~63% of steady-state.

Typical relaxation lengths:
- Passenger car tires: 0.3-0.6 m
- Racing tires: 0.1-0.3 m
- Truck tires: 0.5-1.0 m

This effect is especially important for:
- Rapid steering inputs
- ABS/traction control systems
- Realistic feel in drifting (smoother transitions)
"""

from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class RelaxationState:
    """Current state of tire force relaxation."""
    Fx: float = 0.0        # Current longitudinal force
    Fy: float = 0.0        # Current lateral force
    target_Fx: float = 0.0 # Steady-state longitudinal force
    target_Fy: float = 0.0 # Steady-state lateral force
    tau_x: float = 0.0     # Current longitudinal time constant
    tau_y: float = 0.0     # Current lateral time constant


class TireRelaxation:
    """First-order tire force dynamics using relaxation length model.

    The time constant for force buildup depends on velocity:
        tau = sigma / |velocity|

    At higher speeds, forces build up faster (smaller tau).
    At lower speeds, forces build up slower (larger tau).
    """

    # Minimum velocity to prevent infinite time constant
    MIN_VELOCITY: float = 0.5  # m/s

    # Maximum time constant to ensure forces eventually converge
    MAX_TAU: float = 0.5  # seconds

    def __init__(
        self,
        relaxation_length_x: float = 0.4,
        relaxation_length_y: float = 0.5
    ):
        """Initialize tire relaxation model.

        Args:
            relaxation_length_x: Longitudinal relaxation length (m)
            relaxation_length_y: Lateral relaxation length (m).
                                Typically slightly larger than longitudinal.
        """
        self.sigma_x = relaxation_length_x
        self.sigma_y = relaxation_length_y

        # Current force state
        self.Fx = 0.0
        self.Fy = 0.0

    def update(
        self,
        target_Fx: float,
        target_Fy: float,
        velocity: float,
        dt: float
    ) -> tuple[float, float]:
        """Update tire forces with relaxation dynamics.

        Uses first-order exponential filter:
            F_new = F_old + (F_target - F_old) * (1 - exp(-dt/tau))

        For small dt/tau, this approximates:
            F_new = F_old + (F_target - F_old) * dt/tau

        Args:
            target_Fx: Steady-state longitudinal force (from Pacejka)
            target_Fy: Steady-state lateral force (from Pacejka)
            velocity: Current tire velocity magnitude (m/s)
            dt: Time step (seconds)

        Returns:
            Tuple of (filtered_Fx, filtered_Fy)
        """
        # Calculate time constants
        v = max(abs(velocity), self.MIN_VELOCITY)

        tau_x = min(self.sigma_x / v, self.MAX_TAU)
        tau_y = min(self.sigma_y / v, self.MAX_TAU)

        # First-order filter (exact integration)
        if tau_x > 0:
            alpha_x = 1.0 - math.exp(-dt / tau_x)
            self.Fx += (target_Fx - self.Fx) * alpha_x
        else:
            self.Fx = target_Fx

        if tau_y > 0:
            alpha_y = 1.0 - math.exp(-dt / tau_y)
            self.Fy += (target_Fy - self.Fy) * alpha_y
        else:
            self.Fy = target_Fy

        return self.Fx, self.Fy

    def update_simple(
        self,
        target_Fx: float,
        target_Fy: float,
        velocity: float,
        dt: float
    ) -> tuple[float, float]:
        """Simplified update using linear interpolation.

        Less accurate than exponential but faster to compute.
        Good for very small timesteps.
        """
        v = max(abs(velocity), self.MIN_VELOCITY)

        tau_x = min(self.sigma_x / v, self.MAX_TAU)
        tau_y = min(self.sigma_y / v, self.MAX_TAU)

        # Linear interpolation (first-order approximation)
        alpha_x = min(dt / tau_x, 1.0) if tau_x > 0 else 1.0
        alpha_y = min(dt / tau_y, 1.0) if tau_y > 0 else 1.0

        self.Fx += (target_Fx - self.Fx) * alpha_x
        self.Fy += (target_Fy - self.Fy) * alpha_y

        return self.Fx, self.Fy

    def get_state(self) -> RelaxationState:
        """Get current relaxation state for debugging/visualization."""
        return RelaxationState(
            Fx=self.Fx,
            Fy=self.Fy,
            target_Fx=0.0,  # Would need to track these
            target_Fy=0.0
        )

    def reset(self) -> None:
        """Reset forces to zero."""
        self.Fx = 0.0
        self.Fy = 0.0

    def set_forces(self, Fx: float, Fy: float) -> None:
        """Directly set current forces (bypass relaxation)."""
        self.Fx = Fx
        self.Fy = Fy

    @property
    def current_forces(self) -> tuple[float, float]:
        """Get current filtered forces."""
        return self.Fx, self.Fy


class AdaptiveRelaxation(TireRelaxation):
    """Relaxation model that adapts based on slip conditions.

    At high slip, relaxation can be reduced to allow faster response.
    This helps with aggressive drifting inputs.
    """

    def __init__(
        self,
        relaxation_length_x: float = 0.4,
        relaxation_length_y: float = 0.5,
        high_slip_factor: float = 0.5,
        slip_threshold: float = 0.1
    ):
        """Initialize adaptive relaxation.

        Args:
            relaxation_length_x: Base longitudinal relaxation length
            relaxation_length_y: Base lateral relaxation length
            high_slip_factor: Multiplier for relaxation at high slip (0-1)
            slip_threshold: Slip level above which adaptation begins
        """
        super().__init__(relaxation_length_x, relaxation_length_y)
        self.high_slip_factor = high_slip_factor
        self.slip_threshold = slip_threshold

    def update_adaptive(
        self,
        target_Fx: float,
        target_Fy: float,
        velocity: float,
        slip_ratio: float,
        slip_angle: float,
        dt: float
    ) -> tuple[float, float]:
        """Update with slip-adaptive relaxation.

        Args:
            target_Fx: Steady-state longitudinal force
            target_Fy: Steady-state lateral force
            velocity: Tire velocity magnitude (m/s)
            slip_ratio: Current longitudinal slip ratio
            slip_angle: Current lateral slip angle (radians)
            dt: Time step (seconds)

        Returns:
            Tuple of (filtered_Fx, filtered_Fy)
        """
        # Calculate slip-based adaptation
        combined_slip = math.sqrt(
            slip_ratio * slip_ratio +
            math.tan(slip_angle) ** 2 if abs(slip_angle) < 1.5 else 100
        )

        # Interpolate relaxation length based on slip
        if combined_slip > self.slip_threshold:
            t = min((combined_slip - self.slip_threshold) / (1.0 - self.slip_threshold), 1.0)
            factor = 1.0 - t * (1.0 - self.high_slip_factor)
        else:
            factor = 1.0

        # Temporarily adjust relaxation lengths
        orig_x, orig_y = self.sigma_x, self.sigma_y
        self.sigma_x *= factor
        self.sigma_y *= factor

        # Update with adapted relaxation
        result = self.update(target_Fx, target_Fy, velocity, dt)

        # Restore original values
        self.sigma_x, self.sigma_y = orig_x, orig_y

        return result
