// Simple in-memory Prometheus metrics implementation
const metrics = {
  requests: {},
  durations: []
};

const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const key = `${req.method}_${req.route ? req.route.path : req.path}_${res.statusCode}`;
    
    if (!metrics.requests[key]) {
      metrics.requests[key] = {
        method: req.method,
        route: req.route ? req.route.path : req.path,
        status: res.statusCode,
        count: 0
      };
    }
    
    metrics.requests[key].count++;
    metrics.durations.push(duration);
    
    if (metrics.durations.length > 10000) {
      metrics.durations.shift();
    }
  });
  
  next();
};

const metricsEndpoint = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  let output = '# HELP http_requests_total Total number of HTTP requests\n';
  output += '# TYPE http_requests_total counter\n';
  
  for (const key in metrics.requests) {
    const reqData = metrics.requests[key];
    output += `http_requests_total{method="${reqData.method}",route="${reqData.route}",status="${reqData.status}"} ${reqData.count}\n`;
  }
  
  output += '\n# HELP http_request_duration_seconds HTTP request duration in seconds\n';
  output += '# TYPE http_request_duration_seconds histogram\n';
  
  const buckets = { '0.1': 0, '0.5': 0, '1': 0, '5': 0, '+Inf': 0 };
  let sum = 0;
  metrics.durations.forEach(d => {
    sum += d;
    if (d <= 0.1) buckets['0.1']++;
    if (d <= 0.5) buckets['0.5']++;
    if (d <= 1) buckets['1']++;
    if (d <= 5) buckets['5']++;
    buckets['+Inf']++;
  });
  
  for (const [le, count] of Object.entries(buckets)) {
    output += `http_request_duration_seconds_bucket{le="${le}"} ${count}\n`;
  }
  
  output += `http_request_duration_seconds_sum ${sum}\n`;
  output += `http_request_duration_seconds_count ${metrics.durations.length}\n`;
  
  res.send(output);
};

module.exports = {
  metricsMiddleware,
  metricsEndpoint
};
