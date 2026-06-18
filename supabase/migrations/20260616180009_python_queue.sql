-- Dedicated queue for the Python worker (services/worker-py).
--
-- Each pgmq queue should be owned by exactly one worker type — otherwise
-- both workers race and one archives the message before the other can
-- handle it. worker-node owns `default`/`emails`/`billing`; worker-py
-- owns `data`. Derived projects add more on either side as needs grow.

select pgmq.create('data');
