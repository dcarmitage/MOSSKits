"""Pacejka Magic Formula tire model implementation.

The Magic Formula is the industry-standard empirical tire model developed by
Hans B. Pacejka. It describes the relationship between tire slip and generated
forces using a sine-arctangent function:

    F = D * sin(C * arctan(B*x - E*(B*x - arctan(B*x)))) + Sv

Where:
    B = Stiffness factor (affects slope near zero slip)
    C = Shape factor (affects peak location and overall shape)
    D = Peak value (maximum force)
    E = Curvature factor (affects post-peak behavior)
    Sv = Vertical shift
    x = slip (ratio or angle) + Sh (horizontal shift)

References:
- Pacejka, H. B. "Tire and Vehicle Dynamics" (2012)
- https://www.edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class PacejkaParams:
    """Pacejka '94 Magic Formula coefficients.

    Organized by force direction:
    - b0-b13: Longitudinal (braking/acceleration)
    - a0-a17: Lateral (cornering)

    Load is typically in Newtons, slip ratio is dimensionless [-1,1],
    and slip angle can be in degrees or radians (configure via slip_angle_in_degrees).
    """

    # Longitudinal coefficients (Fx)
    b0: float = 1.65     # Shape factor C
    b1: float = 0.0      # Load influence on Cs
    b2: float = 1688.0   # Longitudinal friction coefficient * load
    b3: float = 0.0      # Curvature factor of stiffness
    b4: float = 229.0    # Curvature factor of stiffness
    b5: float = 0.0      # Curvature factor of stiffness
    b6: float = 0.0      # Curvature factor
    b7: float = 0.0      # Curvature factor
    b8: float = -10.0    # Curvature factor
    b9: float = 0.0      # Horizontal shift
    b10: float = 0.0     # Horizontal shift
    b11: float = 0.0     # Vertical shift
    b12: float = 0.0     # Vertical shift
    b13: float = 0.0     # Curvature factor

    # Lateral coefficients (Fy)
    a0: float = 1.3      # Shape factor C
    a1: float = -22.1    # Fz influence on Dy
    a2: float = 1011.0   # Lateral friction coefficient * load
    a3: float = 1078.0   # Maximum cornering stiffness
    a4: float = 1.82     # Load at maximum Cs
    a5: float = 0.208    # Camber influence on Cs
    a6: float = 0.0      # Curvature factor
    a7: float = -0.354   # Curvature factor
    a8: float = 0.707    # Horizontal shift at Fznom
    a9: float = 0.028    # Load influence on Sh
    a10: float = 0.0     # Camber influence on Sh
    a11: float = 14.8    # Vertical shift at Fznom
    a12: float = 0.022   # Load influence on Sv
    a13: float = 0.0     # Camber influence on Sv
    a14: float = 0.0     # Camber squared influence on Sv
    a15: float = 0.0     # Camber influence on peak
    a16: float = 0.0     # Curvature factor
    a17: float = 0.0     # Curvature factor

    # Configuration
    nominal_load: float = 4000.0  # Reference vertical load (N)
    slip_angle_in_degrees: bool = True  # If True, slip angle inputs are in degrees

    @classmethod
    def sport_tire(cls) -> PacejkaParams:
        """Parameters for a typical sport tire with high grip."""
        return cls(
            # Longitudinal
            b0=1.65, b1=0.0, b2=1688.0, b3=0.0, b4=229.0,
            b5=0.0, b6=0.0, b7=0.0, b8=-10.0, b9=0.0,
            b10=0.0, b11=0.0, b12=0.0, b13=0.0,
            # Lateral
            a0=1.3, a1=-22.1, a2=1011.0, a3=1078.0, a4=1.82,
            a5=0.208, a6=0.0, a7=-0.354, a8=0.707, a9=0.028,
            a10=0.0, a11=14.8, a12=0.022, a13=0.0, a14=0.0,
            a15=0.0, a16=0.0, a17=0.0,
            nominal_load=4000.0
        )

    @classmethod
    def drift_tire(cls) -> PacejkaParams:
        """Parameters for a drift tire - lower grip, more progressive breakaway."""
        return cls(
            # Longitudinal - slightly reduced grip
            b0=1.5, b1=0.0, b2=1400.0, b3=0.0, b4=200.0,
            b5=0.0, b6=0.0, b7=0.0, b8=-8.0, b9=0.0,
            b10=0.0, b11=0.0, b12=0.0, b13=0.0,
            # Lateral - reduced peak, wider slip angle range before falloff
            a0=1.2, a1=-18.0, a2=850.0, a3=900.0, a4=2.0,
            a5=0.15, a6=0.0, a7=-0.2, a8=0.5, a9=0.02,
            a10=0.0, a11=10.0, a12=0.015, a13=0.0, a14=0.0,
            a15=0.0, a16=0.0, a17=0.0,
            nominal_load=4000.0
        )

    @classmethod
    def rain_tire(cls) -> PacejkaParams:
        """Parameters for wet/rain conditions - significantly reduced grip."""
        return cls(
            # Longitudinal - much reduced
            b0=1.4, b1=0.0, b2=1000.0, b3=0.0, b4=150.0,
            b5=0.0, b6=0.0, b7=0.0, b8=-5.0, b9=0.0,
            b10=0.0, b11=0.0, b12=0.0, b13=0.0,
            # Lateral - much reduced, earlier breakaway
            a0=1.1, a1=-15.0, a2=600.0, a3=700.0, a4=2.5,
            a5=0.1, a6=0.0, a7=-0.1, a8=0.3, a9=0.01,
            a10=0.0, a11=5.0, a12=0.01, a13=0.0, a14=0.0,
            a15=0.0, a16=0.0, a17=0.0,
            nominal_load=4000.0
        )


class PacejkaFormula:
    """Pacejka Magic Formula tire force calculator.

    Computes longitudinal (Fx) and lateral (Fy) tire forces given
    slip conditions and vertical load.
    """

    def __init__(self, params: Optional[PacejkaParams] = None):
        """Initialize with Pacejka coefficients.

        Args:
            params: Pacejka coefficients. Defaults to sport tire if None.
        """
        self.params = params or PacejkaParams.sport_tire()

    @staticmethod
    def magic_formula(x: float, B: float, C: float, D: float, E: float,
                      Sh: float = 0.0, Sv: float = 0.0) -> float:
        """Core Magic Formula calculation.

        F = D * sin(C * arctan(B*(x+Sh) - E*(B*(x+Sh) - arctan(B*(x+Sh))))) + Sv

        Args:
            x: Slip value (ratio or angle)
            B: Stiffness factor
            C: Shape factor
            D: Peak value
            E: Curvature factor
            Sh: Horizontal shift
            Sv: Vertical shift

        Returns:
            Force value
        """
        x1 = x + Sh
        Bx1 = B * x1
        return D * math.sin(C * math.atan(Bx1 - E * (Bx1 - math.atan(Bx1)))) + Sv

    def longitudinal_force(self, slip_ratio: float, Fz: float) -> float:
        """Calculate longitudinal force (Fx) from slip ratio.

        Args:
            slip_ratio: Longitudinal slip ratio, typically [-1, 1]
                       Negative = braking, Positive = acceleration
            Fz: Vertical load in Newtons

        Returns:
            Longitudinal force in Newtons (positive = forward thrust)
        """
        if Fz <= 0:
            return 0.0

        p = self.params
        Fz_kN = Fz / 1000.0  # Convert to kN for coefficient scaling

        # Calculate Magic Formula parameters
        C = p.b0
        D = Fz * (p.b1 * Fz_kN + p.b2) / 1000.0

        # BCD (cornering stiffness)
        BCD = (p.b3 * Fz_kN * Fz_kN + p.b4 * Fz_kN) * math.exp(-p.b5 * Fz_kN)
        B = BCD / (C * D) if abs(C * D) > 1e-6 else 0.0

        # Curvature factor
        E = (p.b6 * Fz_kN * Fz_kN + p.b7 * Fz_kN + p.b8)

        # Shifts
        Sh = p.b9 * Fz_kN + p.b10
        Sv = p.b11 * Fz_kN + p.b12

        return self.magic_formula(slip_ratio, B, C, D, E, Sh, Sv)

    def lateral_force(self, slip_angle: float, Fz: float, camber: float = 0.0) -> float:
        """Calculate lateral force (Fy) from slip angle.

        Args:
            slip_angle: Slip angle. In degrees if params.slip_angle_in_degrees,
                       otherwise radians.
            Fz: Vertical load in Newtons
            camber: Camber angle in degrees (optional)

        Returns:
            Lateral force in Newtons (positive = force to the right)
        """
        if Fz <= 0:
            return 0.0

        p = self.params

        # Convert to degrees if needed (formula expects degrees)
        if not p.slip_angle_in_degrees:
            slip_angle = math.degrees(slip_angle)

        Fz_kN = Fz / 1000.0  # Convert to kN

        # Peak factor D with camber influence
        D = Fz * (p.a1 * Fz_kN + p.a2) * (1 - p.a15 * camber * camber) / 1000.0

        # Shape factor
        C = p.a0

        # BCD (cornering stiffness) with camber influence
        BCD = p.a3 * math.sin(2 * math.atan(Fz_kN / p.a4)) * (1 - p.a5 * abs(camber))
        B = BCD / (C * D) if abs(C * D) > 1e-6 else 0.0

        # Curvature factor with camber
        E = (p.a6 * Fz_kN + p.a7) * (1 - (p.a16 * camber + p.a17) * math.copysign(1, slip_angle))

        # Horizontal shift with load and camber
        Sh = p.a8 * Fz_kN + p.a9 + p.a10 * camber

        # Vertical shift with load and camber
        Sv = (p.a11 * Fz_kN + p.a12) + (p.a13 * Fz_kN + p.a14) * camber * Fz_kN

        return self.magic_formula(slip_angle, B, C, D, E, Sh, Sv)

    def get_peak_lateral_force(self, Fz: float, camber: float = 0.0) -> tuple[float, float]:
        """Find the peak lateral force and corresponding slip angle.

        Args:
            Fz: Vertical load in Newtons
            camber: Camber angle in degrees

        Returns:
            Tuple of (peak_force, peak_slip_angle)
        """
        # Search for peak in reasonable range
        slip_angles = np.linspace(0, 20, 200)
        forces = [abs(self.lateral_force(a, Fz, camber)) for a in slip_angles]
        peak_idx = np.argmax(forces)
        return forces[peak_idx], slip_angles[peak_idx]

    def get_peak_longitudinal_force(self, Fz: float) -> tuple[float, float]:
        """Find the peak longitudinal force and corresponding slip ratio.

        Args:
            Fz: Vertical load in Newtons

        Returns:
            Tuple of (peak_force, peak_slip_ratio)
        """
        slip_ratios = np.linspace(0, 0.5, 200)
        forces = [abs(self.longitudinal_force(sr, Fz)) for sr in slip_ratios]
        peak_idx = np.argmax(forces)
        return forces[peak_idx], slip_ratios[peak_idx]

    def get_lateral_curve(self, Fz: float, slip_range: tuple[float, float] = (-20, 20),
                          num_points: int = 100, camber: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Generate lateral force curve for plotting.

        Args:
            Fz: Vertical load in Newtons
            slip_range: Range of slip angles (min, max)
            num_points: Number of points to calculate
            camber: Camber angle in degrees

        Returns:
            Tuple of (slip_angles, forces) arrays
        """
        slip_angles = np.linspace(slip_range[0], slip_range[1], num_points)
        forces = np.array([self.lateral_force(a, Fz, camber) for a in slip_angles])
        return slip_angles, forces

    def get_longitudinal_curve(self, Fz: float, slip_range: tuple[float, float] = (-1, 1),
                                num_points: int = 100) -> tuple[np.ndarray, np.ndarray]:
        """Generate longitudinal force curve for plotting.

        Args:
            Fz: Vertical load in Newtons
            slip_range: Range of slip ratios (min, max)
            num_points: Number of points to calculate

        Returns:
            Tuple of (slip_ratios, forces) arrays
        """
        slip_ratios = np.linspace(slip_range[0], slip_range[1], num_points)
        forces = np.array([self.longitudinal_force(sr, Fz) for sr in slip_ratios])
        return slip_ratios, forces
