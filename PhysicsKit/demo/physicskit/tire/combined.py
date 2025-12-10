"""Combined slip handling using friction ellipse model.

When a tire experiences both longitudinal slip (acceleration/braking) and
lateral slip (cornering) simultaneously, the forces interact. The friction
ellipse model constrains the total force vector to remain within an ellipse:

    (Fx/Fx_max)^2 + (Fy/Fy_max)^2 <= 1

This is critical for realistic drifting simulation where you're always
using both longitudinal (throttle) and lateral (steering) grip.
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Tuple, Optional

from physicskit.tire.pacejka import PacejkaFormula, PacejkaParams


@dataclass
class CombinedForces:
    """Result of combined slip force calculation."""
    Fx: float = 0.0          # Longitudinal force (N)
    Fy: float = 0.0          # Lateral force (N)
    Fx_pure: float = 0.0     # Pure longitudinal force (no combined slip)
    Fy_pure: float = 0.0     # Pure lateral force (no combined slip)
    saturation: float = 0.0  # How close to friction limit (0-1)


class CombinedSlip:
    """Handle combined longitudinal and lateral tire slip.

    Implements several methods for combining tire forces:
    1. Friction ellipse scaling
    2. Simple vector addition with ellipse limit
    3. More accurate Pacejka-style combined slip formulas
    """

    def __init__(
        self,
        pacejka: Optional[PacejkaFormula] = None,
        friction_mu: float = 1.0,
        ellipse_ratio: float = 1.0
    ):
        """Initialize combined slip handler.

        Args:
            pacejka: Pacejka formula for calculating pure slip forces
            friction_mu: Overall friction coefficient multiplier
            ellipse_ratio: Ratio of Fy_max / Fx_max for friction ellipse.
                          1.0 = circle, <1 = more longitudinal, >1 = more lateral
        """
        self.pacejka = pacejka or PacejkaFormula()
        self.friction_mu = friction_mu
        self.ellipse_ratio = ellipse_ratio

    def combined_forces_simple(
        self,
        slip_ratio: float,
        slip_angle: float,
        Fz: float,
        camber: float = 0.0
    ) -> CombinedForces:
        """Calculate combined forces using simple friction ellipse.

        Method:
        1. Calculate pure slip forces
        2. Scale both forces to fit within friction ellipse

        This is computationally simple but less accurate than the
        slip-based method for large combined slip.

        Args:
            slip_ratio: Longitudinal slip ratio
            slip_angle: Lateral slip angle (degrees if pacejka configured so)
            Fz: Vertical load (N)
            camber: Camber angle (degrees)

        Returns:
            CombinedForces with scaled Fx and Fy
        """
        # Get pure slip forces
        Fx_pure = self.pacejka.longitudinal_force(slip_ratio, Fz) * self.friction_mu
        Fy_pure = self.pacejka.lateral_force(slip_angle, Fz, camber) * self.friction_mu

        # Get peak forces for normalization
        Fx_peak, _ = self.pacejka.get_peak_longitudinal_force(Fz)
        Fy_peak, _ = self.pacejka.get_peak_lateral_force(Fz, camber)

        Fx_peak *= self.friction_mu
        Fy_peak *= self.friction_mu * self.ellipse_ratio

        # Check if we're within the friction ellipse
        if Fx_peak < 1 or Fy_peak < 1:
            return CombinedForces(0, 0, Fx_pure, Fy_pure, 0)

        # Normalized position in friction space
        fx_norm = Fx_pure / Fx_peak if Fx_peak > 0 else 0
        fy_norm = Fy_pure / Fy_peak if Fy_peak > 0 else 0

        # Distance from origin in normalized space
        saturation = math.sqrt(fx_norm * fx_norm + fy_norm * fy_norm)

        if saturation <= 1.0:
            # Within ellipse, no scaling needed
            return CombinedForces(
                Fx=Fx_pure,
                Fy=Fy_pure,
                Fx_pure=Fx_pure,
                Fy_pure=Fy_pure,
                saturation=saturation
            )

        # Outside ellipse, scale back to boundary
        scale = 1.0 / saturation
        return CombinedForces(
            Fx=Fx_pure * scale,
            Fy=Fy_pure * scale,
            Fx_pure=Fx_pure,
            Fy_pure=Fy_pure,
            saturation=1.0
        )

    def combined_forces_vector(
        self,
        slip_ratio: float,
        slip_angle_rad: float,
        Fz: float,
        camber: float = 0.0
    ) -> CombinedForces:
        """Calculate combined forces using vector slip method.

        This method treats slip as a 2D vector and uses its magnitude
        to look up force, then decomposes back to Fx/Fy.

        More physically accurate for combined slip situations.

        Args:
            slip_ratio: Longitudinal slip ratio
            slip_angle_rad: Lateral slip angle in RADIANS
            Fz: Vertical load (N)
            camber: Camber angle (degrees)

        Returns:
            CombinedForces
        """
        # Pure slip forces for reference
        slip_angle_deg = math.degrees(slip_angle_rad)
        Fx_pure = self.pacejka.longitudinal_force(slip_ratio, Fz) * self.friction_mu
        Fy_pure = self.pacejka.lateral_force(slip_angle_deg, Fz, camber) * self.friction_mu

        # Avoid issues at zero slip
        epsilon = 1e-6

        # Lateral slip as equivalent ratio
        tan_alpha = math.tan(slip_angle_rad) if abs(slip_angle_rad) < 1.5 else 10.0

        # Combined slip magnitude (sigma)
        sigma = math.sqrt(slip_ratio * slip_ratio + tan_alpha * tan_alpha)

        if sigma < epsilon:
            return CombinedForces(0, 0, Fx_pure, Fy_pure, 0)

        # Use lateral force curve with combined slip magnitude
        # This is a simplification - could use a dedicated combined curve
        sigma_deg = math.degrees(math.atan(sigma))  # Convert to "equivalent angle"
        F_combined = abs(self.pacejka.lateral_force(sigma_deg, Fz, camber)) * self.friction_mu

        # Decompose back to Fx and Fy based on slip components
        Fx = F_combined * (slip_ratio / sigma) if sigma > epsilon else 0
        Fy = F_combined * (tan_alpha / sigma) if sigma > epsilon else 0

        # Apply signs from original slip
        Fx = math.copysign(Fx, slip_ratio)
        Fy = math.copysign(Fy, slip_angle_rad)

        # Calculate saturation
        Fx_peak, _ = self.pacejka.get_peak_longitudinal_force(Fz)
        Fy_peak, _ = self.pacejka.get_peak_lateral_force(Fz, camber)
        F_peak = math.sqrt(Fx_peak**2 + Fy_peak**2) * self.friction_mu

        saturation = math.sqrt(Fx**2 + Fy**2) / F_peak if F_peak > 0 else 0

        return CombinedForces(
            Fx=Fx,
            Fy=Fy,
            Fx_pure=Fx_pure,
            Fy_pure=Fy_pure,
            saturation=min(1.0, saturation)
        )

    def combined_forces_empirical(
        self,
        slip_ratio: float,
        slip_angle_deg: float,
        Fz: float,
        camber: float = 0.0
    ) -> CombinedForces:
        """Calculate combined forces using empirical weighting.

        Uses a cosine-based weighting that reduces each force based
        on how much of the friction budget is used by the other.

        This provides smooth, stable behavior suitable for real-time simulation.

        Args:
            slip_ratio: Longitudinal slip ratio
            slip_angle_deg: Lateral slip angle in degrees
            Fz: Vertical load (N)
            camber: Camber angle (degrees)

        Returns:
            CombinedForces
        """
        # Pure slip forces
        Fx_pure = self.pacejka.longitudinal_force(slip_ratio, Fz) * self.friction_mu
        Fy_pure = self.pacejka.lateral_force(slip_angle_deg, Fz, camber) * self.friction_mu

        # Get peak forces
        Fx_peak, _ = self.pacejka.get_peak_longitudinal_force(Fz)
        Fy_peak, _ = self.pacejka.get_peak_lateral_force(Fz, camber)
        Fx_peak *= self.friction_mu
        Fy_peak *= self.friction_mu

        if Fx_peak < 1 or Fy_peak < 1:
            return CombinedForces(0, 0, Fx_pure, Fy_pure, 0)

        # Normalized forces
        fx_norm = abs(Fx_pure) / Fx_peak
        fy_norm = abs(Fy_pure) / Fy_peak

        # Use cosine weighting based on the "angle" in normalized force space
        if fx_norm + fy_norm < 0.001:
            return CombinedForces(0, 0, Fx_pure, Fy_pure, 0)

        force_angle = math.atan2(fy_norm, fx_norm)

        # Weighting factors - each force reduced by how much the other uses
        # At force_angle = 0 (pure longitudinal): Gx = 1, Gy = cos(0) = 1
        # At force_angle = pi/2 (pure lateral): Gx = cos(pi/2) = 0, Gy = 1
        # This provides smooth interpolation
        Gx = math.cos(force_angle * 0.5)  # 0.5 makes it less aggressive
        Gy = math.cos((math.pi / 2 - force_angle) * 0.5)

        # Apply weighting
        Fx = Fx_pure * Gx
        Fy = Fy_pure * Gy

        # Check friction ellipse and scale if needed
        fx_scaled = Fx / Fx_peak if Fx_peak > 0 else 0
        fy_scaled = Fy / Fy_peak if Fy_peak > 0 else 0
        saturation = math.sqrt(fx_scaled * fx_scaled + fy_scaled * fy_scaled)

        if saturation > 1.0:
            scale = 1.0 / saturation
            Fx *= scale
            Fy *= scale
            saturation = 1.0

        return CombinedForces(
            Fx=Fx,
            Fy=Fy,
            Fx_pure=Fx_pure,
            Fy_pure=Fy_pure,
            saturation=saturation
        )

    def calculate(
        self,
        slip_ratio: float,
        slip_angle_deg: float,
        Fz: float,
        camber: float = 0.0,
        method: str = "empirical"
    ) -> CombinedForces:
        """Calculate combined slip forces using specified method.

        Args:
            slip_ratio: Longitudinal slip ratio
            slip_angle_deg: Lateral slip angle in degrees
            Fz: Vertical load (N)
            camber: Camber angle (degrees)
            method: "simple", "vector", or "empirical"

        Returns:
            CombinedForces
        """
        if method == "simple":
            return self.combined_forces_simple(slip_ratio, slip_angle_deg, Fz, camber)
        elif method == "vector":
            return self.combined_forces_vector(
                slip_ratio, math.radians(slip_angle_deg), Fz, camber
            )
        else:  # empirical (default)
            return self.combined_forces_empirical(slip_ratio, slip_angle_deg, Fz, camber)


def friction_ellipse_limit(
    Fx: float,
    Fy: float,
    Fx_max: float,
    Fy_max: float
) -> Tuple[float, float]:
    """Clamp force vector to friction ellipse boundary.

    Args:
        Fx: Longitudinal force
        Fy: Lateral force
        Fx_max: Maximum longitudinal force
        Fy_max: Maximum lateral force

    Returns:
        Tuple of (clamped_Fx, clamped_Fy)
    """
    if Fx_max <= 0 or Fy_max <= 0:
        return 0.0, 0.0

    # Normalized position
    fx_norm = Fx / Fx_max
    fy_norm = Fy / Fy_max

    # Check if outside ellipse
    r_sq = fx_norm * fx_norm + fy_norm * fy_norm

    if r_sq <= 1.0:
        return Fx, Fy

    # Scale to ellipse boundary
    scale = 1.0 / math.sqrt(r_sq)
    return Fx * scale, Fy * scale
