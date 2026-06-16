-- Initial pgmq queues.
--
-- docs/architecture/05-jobs.md: pgmq is the substrate; packages/jobs is the
-- typed wrapper. Queues created here are read by services/worker-node and
-- services/worker-py. New queues should be created in dedicated migrations so
-- the schema history makes the surface visible.

select pgmq.create('default');
select pgmq.create('emails');
select pgmq.create('billing');
