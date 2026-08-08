// Tracks batch-job progress in PropertiesService (not a sheet cell) to avoid write races
// between overlapping trigger runs.
function getCheckpoint(jobName) {
  const value = PropertiesService.getScriptProperties().getProperty('checkpoint_' + jobName);
  return value ? JSON.parse(value) : { cursor: 0 };
}

function setCheckpoint(jobName, checkpoint) {
  PropertiesService.getScriptProperties().setProperty('checkpoint_' + jobName, JSON.stringify(checkpoint));
}

function resetCheckpoint(jobName) {
  PropertiesService.getScriptProperties().deleteProperty('checkpoint_' + jobName);
}

function logJobRun(jobType, itemsProcessed, callsMade, errorsCount) {
  appendRow(SHEET_JOB_LOG, [new Date(), jobType, itemsProcessed, callsMade, errorsCount]);
}

// Runs `work()` only if no other instance of this job is currently running.
// Returns null (and logs nothing) if the lock couldn't be acquired.
function withJobLock(jobName, work) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(5000);
  if (!acquired) {
    Logger.log('Could not acquire lock for job: ' + jobName + ' — another run is in progress.');
    return null;
  }
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}
