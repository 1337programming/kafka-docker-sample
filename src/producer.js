const KafkaProducer = require('node-rdkafka').Producer; // Kafka Node SDK
const {Subject} = require('rxjs'); // Reactive Extension (helps us structure events)
require('rxjs/add/operator/toPromise');
const KafkaClient = require('./client');
const {DEFAULT_PRODUCER_CONFIG} = require('./default-config');

/**
 * Kafka Producer
 * @param {ProducerConfig} [conf=DEFAULT_PRODUCER_CONFIG] - defaults to default config
 * @param {Config} [topicConfig=null] - the Kafka Topic Configuration
 */
class Producer extends KafkaClient {

  /**
   * @param {ProducerConfig} [conf=DEFAULT_PRODUCER_CONFIG] - defaults to default config
   * @param {Config} [topicConfig=null] - the Kafka Topic Configuration
   */
  constructor(conf = DEFAULT_PRODUCER_CONFIG, topicConfig = null) {
    super();

    this._config = Object.assign(DEFAULT_PRODUCER_CONFIG, conf); // Ensures defaults

    this._pollLoop = null;
    this._deliveryReportDispatcher = new Subject();
    this.kafkaProducer = new KafkaProducer(this._config.client, topicConfig);
    this._initEvent();
  }

  /**
   * Connect to Kafka
   * @return {Promise<void>}
   */
  connect() {
    return super.connectClient(this.kafkaProducer)
      .then((args) => {
        console.log('Producer Connection Args', new Date(), args);
        if (this._config.autoInterval) {
          this._pollLoop = setInterval(() => {
            this.kafkaProducer.poll();
          }, this._config.throttle);
        }
      });
  }

  /**
   * Disconnect from Kafka
   * @return {Promise<void>}
   */
  disconnect() {
    if (this._config.autoInterval) {
      clearInterval(this._pollLoop);
    }
    return super.disconnectClient(this.kafkaProducer);
  }

  /**
   * Publish a message
   * @param {String} message - message to send
   * @param {String} [topic=this._config.topics[0]] - topic to send to
   * @param {number} [partition=-1] - optionally  specify a partition for the message, this defaults to -1 - which will
   *  use librdkafka's default partitioner (consistent random for keyed messages, random for unkeyed messages)
   * @param {String} [key=null] - keyed message (optional)
   * @param {String} [opaque=null] - opaque token which gets passed along to your delivery reports
   * @return {Promise<DeliveryReport>}
   * @TODO will delivery report be synchronized with produce?
   */
  publish(message, topic = this._config.topics[0], partition = -1, key = null, opaque = null) {
    return new Promise((resolve, reject) => {

      try {
        this.kafkaProducer.produce(
          topic,
          partition,
          // eslint-disable-next-line new-cap
          new Buffer.from(message),
          key,
          Date.now(),
          opaque
        );

        this.kafkaProducer.prependListener('delivery-report', (err, report) => {
          if (err) {
            super.emitError(err);
          }
          console.log('Delivery Report Operation:', new Date(), report);
          this._deliveryReportDispatcher.next(report);
          resolve(report);
        });

      } catch (err) {
        console.error('Producer Operation (Error)', new Date(), err);
        super.emitError(err);
        return Promise.reject(err);
      }
    });
  }

  /**
   * Publish a message
   * @param {String} message - message to send
   * @param {String} [topic=this._config.topics[0]] - topic to send to
   * @param {number} [partition=-1] - optionally  specify a partition for the message, this defaults to -1 - which will
   *  use librdkafka's default partitioner (consistent random for keyed messages, random for unkeyed messages)
   * @param {String} [key=null] - keyed message (optional)
   * @param {String} [opaque=null] - opaque token which gets passed along to your delivery reports
   * @return {Promise<DeliveryReport>}
   * @TODO will delivery report be synchronized with produce?
   */
  publish(message, topic = this._config.topics[0], partition = -1, key = null, opaque = null) {
    return new Promise((resolve, reject) => {

      try {
        this.kafkaProducer.produce(
          topic,
          partition,
          this._createBuffer(message),
          key,
          Date.now(),
          opaque
        );

        this.kafkaProducer.prependListener('delivery-report', (err, report) => {
          if (err) {
            // @TODO don't error here?
            super.emitError(err);
          }
          console.log('Delivery Report Operation:', new Date(), report);
          this._deliveryReportDispatcher.next(report);
          resolve(report);
        });

      } catch (err) {
        console.error('Producer Operation (Error)', new Date(), err);
        super.emitError(err);
        return reject(err);
      }
    });
  }

  /**
   * Polls the producer for delivery reports or other events to be transmitted via the emitter.
   */
  poll() {
    this.kafkaProducer.poll();
  }

  /**
   * Stream delivery report from the kafka producer
   * @return {Observable<DeliveryReport>}
   */
  onReport() {
    return this._deliveryReportDispatcher.asObservable();
  }

  /**
   * checks to see if obj is a buffer
   * @param {object} obj to check
   * @return {boolean|*}
   * @private
   */
  _isBuffer(obj) {
    return obj != null && obj.constructor != null &&
      typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj);
  }

  /**
   * create buffer from message
   * @param {object} message
   * @return {*}
   * @private {Buffer}
   */
  _createBuffer(message) {
    if (this._isBuffer(message)) {
      // eslint-disable-next-line new-cap
      return message;
    } else if (typeof message === 'string') {
      // eslint-disable-next-line new-cap
      return new Buffer.from(message);
    } else {
      try {
        // eslint-disable-next-line new-cap
        return new Buffer.from(JSON.stringify(message));
      } catch (err) {
        throw new Error('Invalid message input ' + err);
      }
    }
  }

  /**
   * Initializes the events
   * @private
   * @return {void}
   */
  _initEvent() {

    super.initEventLogs(this.kafkaProducer);

    this.kafkaProducer.on('delivery-report', (err, report) => {
      if (err) {
        super.emitError(err);
      }
      console.log('Delivery Report Operation:', new Date(), report);
      this._deliveryReportDispatcher.next(report);
    });

  }

}

module.exports = Producer;
