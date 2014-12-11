/**
 * @fileOverview Description file.
 */

var should = require('should')
  , request = require('supertest')
  , substance = require('./../')
  , mongoose = require('mongoose')
  , db = require('./extras.js');

describe('Resources', function() {
  var app;

  before(function( done ){
    app = substance();
    mongoose.connection.once('open', function(){
      done();
    });
  });

  describe('Default settings', function(){

    var user_id;

    before(function( done ){
      app.resource('user', {
        name: { type: String, isRequired: true },
        password: String,
        roles: [ String ]
      })
        .after('delete', function( req, res, result, next ){
          result = 'DELETE';
          next( null, result );
        });

      app.use(substance.Error.errorHandler);

      done();
    });

    it('create', function(done) {
      request(app)
        .post('/users')
        .send({
          password: 123
        })
        .expect(201, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.result._id.should.match(db.regexp.id);
          res.body.result.password.should.equal('123');

          user_id = res.body.result._id;

          done();
        });
    });

    it('list', function(done) {
      request(app)
        .get('/users')
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.result[0]._id.should.match(db.regexp.id);
          res.body.result[0].password.should.equal('123');

          done();
        });
    });

    it('default meta in list', function(done) {
      request(app)
        .get('/users')
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.meta.count.should.equal(1);
          res.body.meta.total.should.equal(1);
          res.body.meta.skip.should.equal(0);
          res.body.meta.limit.should.equal(25);

          done();
        });
    });

    it('check content type', function(done) {
      request(app)
        .post('/users')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(412, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          done();
        });
    });

    it('validate query params', function(done) {
      request(app)
        .get('/users')
        .query({
          populate: [],
          limit: 3000
        })
        .expect(400, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.error.errors.should.have.property('limit');

          done();
        });
    });

    it('check content type', function(done) {
      request(app)
        .post('/users')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(412, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          done();
        });
    });

    it('update', function(done) {
      request(app)
        .put('/users/' + user_id)
        .send({
          password: 321
        })
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.result._id.should.match(db.regexp.id);
          res.body.result.password.should.equal('321');

          done();
        });
    });

    it('delete', function(done) {
      request(app)
        .delete('/users/' + user_id)
        .send()
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.text.should.equal('DELETE');

          done();
        });
    });

  });

  describe('Add custom transformation', function(){
    before(function( done ){
      app.resource('anotherUser', {
        name: { type: String, isRequired: true },
        password: String,
        roles: [ String ]
      })
        .before( 'create', function( req, res, next ){
          req.body.name = req.body.name.trim().toLowerCase();

          next();
        })
        .afterAll(function(req, res, result, next){
          setTimeout(function(){
            result.etag = 'IEtag';

            next(null, result);
          }, 1)
        });

      app.resource('other', { name: String });

      app.use(substance.Error.errorHandler);

      done();
    });

    it('name should be trimmed and lowered', function(done) {
      request(app)
        .post('/anotherUsers')
        .send({
          name: '  ICamelCase ',
          password: 123
        })
        .expect(201, function(err, res) {
          if (err) {
            //console.log(res.text);
            throw err;
          }

          res.body.result._id.should.match(db.regexp.id);
          res.body.result.name.should.equal('icamelcase');
          res.body.result.password.should.equal('123');

          done();
        });
    });

    it('result should have etag', function(done) {
      request(app)
        .get('/anotherusers')
        .send()
        .expect(200, function(err, res) {
          if (err) {
            //console.log(res.text);
            throw err;
          }

          res.body.result.should.have.length(1);
          res.body.etag.should.equal('IEtag');

          done();
        });
    });
  });

  describe('Rewrite default methods', function(){
    before(function( done ){
      app.resource('rewriter', { name: String })
        .create(function(req, res){
          res.status(501).send();
        });

      app.use(substance.Error.errorHandler);

      done();
    });

    it('should rewrite', function(done) {
      request(app)
        .post('/rewriters')
        .send({})
        .expect(501, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }
          done();
        });
    })
  });

  describe('Custom defaults', function(){
    before(function( done ){
      app.resource('foo', { name: String }, {
        defaults: function( resource ){
          resource.list(function(req, res, next){
            res.status(200).send({ ok: true });
          });
        }
      });

      done();
    });

    it('should rewrite', function(done) {
      request(app)
        .get('/foos')
        .send({})
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.ok.should.equal(true);
          done();
        });
    })
  });

  describe('Clear hooks', function(){
    before(function( done ){
      app.resource('boo', { name: String }).clear('afterall');

      done();
    });

    it('hooks should cleaned ', function(done) {
      request(app)
        .get('/boos')
        .send({})
        .expect(200, function(err, res) {
          if (err) {
            console.log(res.text);
            throw err;
          }

          res.body.should.be.an.instanceOf(Array);
          done();
        });
    })
  });

  after(function( done ){
    mongoose.disconnect( done );
  });
});