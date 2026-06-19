from worker.health import HealthState


def test_initial_state_is_healthy():
    state = HealthState()
    assert state.healthy is True


def test_set_draining_marks_unhealthy():
    state = HealthState()
    state.set_draining()
    assert state.healthy is False
