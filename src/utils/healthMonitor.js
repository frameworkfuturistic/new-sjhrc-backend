const logger = require('./logger');

class HealthMonitor {
  constructor() {
    this.incidents = [];
    this.serviceStatus = {};
    this.alertCooldowns = new Map();
    this.subscribers = []; // For simple pub/sub pattern
  }

  /**
   * Simple event subscription
   * @param {function} callback
   */
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== callback);
    };
  }

  /**
   * Track service health status
   * @param {string} serviceName
   * @param {object} status
   */
  trackService(serviceName, status) {
    this.serviceStatus[serviceName] = {
      ...status,
      timestamp: new Date().toISOString(),
    };

    // Notify subscribers
    this._notifySubscribers('serviceUpdate', {
      serviceName,
      status: this.serviceStatus[serviceName],
    });
  }

  /**
   * Send health alert with cooldown
   * @param {object} alert
   */
  async sendHealthAlert(alert) {
    const { service, error, severity = 'medium', metadata = {} } = alert;

    // Cooldown check (5 minutes for same service+error)
    const alertKey = `${service}:${error}`;
    const lastAlertTime = this.alertCooldowns.get(alertKey) || 0;
    const now = Date.now();

    if (now - lastAlertTime < 300000) {
      // 5 minutes
      logger.debug(`Alert cooldown active for ${alertKey}`);
      return;
    }

    // Create incident record
    const incident = {
      id: `inc_${now}`,
      service,
      error,
      severity,
      timestamp: new Date(now),
      resolved: false,
      metadata,
    };

    this.incidents.push(incident);
    this.alertCooldowns.set(alertKey, now);

    // Process alert
    try {
      await this._processAlert(incident);
      logger.info(`Alert processed for ${service}`, { incident });
    } catch (alertError) {
      logger.error('Failed to process alert:', alertError);
    }
  }

  // In your healthMonitor.js
  async _processAlert(incident) {
    const message = this._formatAlertMessage(incident);

    // Replace logger.critical with logger.error for highest level
    switch (incident.severity) {
      case 'critical':
        logger.error(`CRITICAL: ${message}`); // Changed from logger.critical
        break;
      case 'high':
        logger.error(message);
        break;
      default:
        logger.warn(message);
    }

    this._notifySubscribers('alert', incident);
  }

  _formatAlertMessage(incident) {
    return `[${incident.severity.toUpperCase()}] ${incident.service} service alert: ${incident.error}`;
  }

  _notifySubscribers(event, data) {
    this.subscribers.forEach((sub) => {
      try {
        sub(event, data);
      } catch (e) {
        logger.error('Health monitor subscriber error:', e);
      }
    });
  }

  /**
   * Mark incident as resolved
   * @param {string} incidentId
   */
  resolveIncident(incidentId) {
    const incident = this.incidents.find((i) => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      incident.resolvedAt = new Date();
      this._notifySubscribers('incidentResolved', incident);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    const activeIncidents = this.incidents.filter((i) => !i.resolved);
    const criticalServices = Object.entries(this.serviceStatus)
      .filter(([_, status]) => status.status === 'failed')
      .map(([name]) => name);

    return {
      status: activeIncidents.length > 0 ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      services: this.serviceStatus,
      incidents: {
        active: activeIncidents,
        critical: activeIncidents.filter((i) => i.severity === 'critical'),
      },
      metrics: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        load: process.cpuUsage(),
      },
    };
  }
}

// Singleton instance
module.exports = new HealthMonitor();
