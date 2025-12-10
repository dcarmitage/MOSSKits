"""Numerical integration methods for physics simulation."""

from __future__ import annotations
from enum import Enum
from typing import Callable, TYPE_CHECKING

from physicskit.core.vector import Vector3, normalize_angle

if TYPE_CHECKING:
    from physicskit.core.rigid_body import RigidBody


class IntegratorType(Enum):
    """Available integration methods."""
    SEMI_IMPLICIT_EULER = "semi_implicit_euler"
    RK4 = "rk4"


def semi_implicit_euler(body: RigidBody, dt: float) -> None:
    """Semi-implicit (symplectic) Euler integration.

    Updates velocity before position, which provides better energy
    conservation and stability for oscillatory systems compared to
    explicit Euler.

    Algorithm:
        v(t+dt) = v(t) + a(t) * dt
        x(t+dt) = x(t) + v(t+dt) * dt  # Note: uses NEW velocity

    Args:
        body: RigidBody to integrate
        dt: Time step in seconds
    """
    # Linear motion
    acceleration = body.get_acceleration()
    body.velocity += acceleration * dt
    body.position += body.velocity * dt

    # Angular motion
    angular_accel = body.get_angular_acceleration()
    body.angular_velocity += angular_accel * dt
    body.orientation += body.angular_velocity * dt
    body.orientation = normalize_angle(body.orientation)

    # Clear accumulators for next step
    body.clear_forces()


def explicit_euler(body: RigidBody, dt: float) -> None:
    """Explicit (forward) Euler integration.

    Simpler but less stable than semi-implicit. Use for comparison
    or when forces don't depend on velocity.

    Algorithm:
        x(t+dt) = x(t) + v(t) * dt
        v(t+dt) = v(t) + a(t) * dt
    """
    # Store old velocity for position update
    old_velocity = body.velocity.copy()
    old_angular_velocity = body.angular_velocity

    # Update velocities
    acceleration = body.get_acceleration()
    body.velocity += acceleration * dt

    angular_accel = body.get_angular_acceleration()
    body.angular_velocity += angular_accel * dt

    # Update positions with OLD velocity
    body.position += old_velocity * dt
    body.orientation += old_angular_velocity * dt
    body.orientation = normalize_angle(body.orientation)

    body.clear_forces()


def rk4_step(
    body: RigidBody,
    dt: float,
    force_func: Callable[[Vector3, float, Vector3, float], tuple[Vector3, float]]
) -> None:
    """4th-order Runge-Kutta integration.

    More accurate than Euler methods but requires re-evaluating forces
    at intermediate points, making it more computationally expensive.

    Best used when accuracy is critical and forces are smooth functions
    of state.

    Args:
        body: RigidBody to integrate
        dt: Time step in seconds
        force_func: Function that takes (position, orientation, velocity, angular_vel)
                   and returns (force, torque). Forces must be recalculated
                   for each intermediate state.
    """
    # Save initial state
    pos0 = body.position.copy()
    ori0 = body.orientation
    vel0 = body.velocity.copy()
    angvel0 = body.angular_velocity

    # k1: derivatives at t
    f1, tau1 = force_func(pos0, ori0, vel0, angvel0)
    k1_vel = f1 / body.mass
    k1_angvel = tau1 / body.inertia
    k1_pos = vel0
    k1_ori = angvel0

    # k2: derivatives at t + dt/2 using k1
    pos_mid = pos0 + k1_pos * (dt / 2)
    ori_mid = ori0 + k1_ori * (dt / 2)
    vel_mid = vel0 + k1_vel * (dt / 2)
    angvel_mid = angvel0 + k1_angvel * (dt / 2)

    f2, tau2 = force_func(pos_mid, ori_mid, vel_mid, angvel_mid)
    k2_vel = f2 / body.mass
    k2_angvel = tau2 / body.inertia
    k2_pos = vel_mid
    k2_ori = angvel_mid

    # k3: derivatives at t + dt/2 using k2
    pos_mid = pos0 + k2_pos * (dt / 2)
    ori_mid = ori0 + k2_ori * (dt / 2)
    vel_mid = vel0 + k2_vel * (dt / 2)
    angvel_mid = angvel0 + k2_angvel * (dt / 2)

    f3, tau3 = force_func(pos_mid, ori_mid, vel_mid, angvel_mid)
    k3_vel = f3 / body.mass
    k3_angvel = tau3 / body.inertia
    k3_pos = vel_mid
    k3_ori = angvel_mid

    # k4: derivatives at t + dt using k3
    pos_end = pos0 + k3_pos * dt
    ori_end = ori0 + k3_ori * dt
    vel_end = vel0 + k3_vel * dt
    angvel_end = angvel0 + k3_angvel * dt

    f4, tau4 = force_func(pos_end, ori_end, vel_end, angvel_end)
    k4_vel = f4 / body.mass
    k4_angvel = tau4 / body.inertia
    k4_pos = vel_end
    k4_ori = angvel_end

    # Weighted average
    body.velocity = vel0 + (k1_vel + k2_vel * 2 + k3_vel * 2 + k4_vel) * (dt / 6)
    body.angular_velocity = angvel0 + (k1_angvel + 2*k2_angvel + 2*k3_angvel + k4_angvel) * (dt / 6)
    body.position = pos0 + (k1_pos + k2_pos * 2 + k3_pos * 2 + k4_pos) * (dt / 6)
    body.orientation = normalize_angle(ori0 + (k1_ori + 2*k2_ori + 2*k3_ori + k4_ori) * (dt / 6))

    body.clear_forces()


def verlet_step(
    body: RigidBody,
    dt: float,
    prev_position: Vector3,
    prev_orientation: float
) -> tuple[Vector3, float]:
    """Velocity Verlet integration step.

    Good energy conservation, commonly used in molecular dynamics.
    Requires storing previous position.

    Returns:
        Tuple of (new_prev_position, new_prev_orientation) to store for next step
    """
    acceleration = body.get_acceleration()
    angular_accel = body.get_angular_acceleration()

    # x(t+dt) = 2*x(t) - x(t-dt) + a*dt^2
    new_pos = body.position * 2 - prev_position + acceleration * (dt * dt)
    new_ori = body.orientation * 2 - prev_orientation + angular_accel * (dt * dt)

    # Velocity from positions (for output/other calculations)
    body.velocity = (new_pos - prev_position) / (2 * dt)
    body.angular_velocity = (new_ori - prev_orientation) / (2 * dt)

    # Store current as previous
    old_pos = body.position.copy()
    old_ori = body.orientation

    # Update position
    body.position = new_pos
    body.orientation = normalize_angle(new_ori)

    body.clear_forces()

    return old_pos, old_ori
