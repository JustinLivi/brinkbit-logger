const chai = require( 'chai' );
const chaiaspromised = require( 'chai-as-promised' );
const sinon = require( 'sinon' );
const sinonchai = require( 'sinon-chai' );
const R = require( 'ramda' );
const request = require( 'supertest' );
const http = require( 'http' );

const config = require( './config.js' );

const expect = chai.expect;

chai.use( chaiaspromised );
chai.use( sinonchai );

describe( 'brinkbit-logger', function() {
    this.timeout( 10000 );

    describe( 'configuration', function() {
        it( 'should not crash when missing slack property', function() {
            process.env.SLACK_HOOK = 'invalid';
            require( '../src' ).configure({ id: Math.random(), transport: 'debug' });
        });
    });

    describe( 'get', function() {
        it( 'should return the configured logger', function() {
            const logger = require( '../src' );
            const configured = logger.configure({ id: '0', transport: 'debug' });
            expect( logger.get( '0' )).to.equal( configured );
        });
    });

    describe( '/debug', function() {
        it( 'should console log verbose message on debug', function( done ) {
            const logger = require( '../src' ).configure({ id: Math.random(), transport: 'debug' });
            logger.on( 'logging', ( transport, level, msg, meta ) => {
                expect( transport ).to.have.property( 'name' ).and.equal( 'console' );
                expect( level ).to.equal( 'debug' );
                expect( msg ).to.match( /"message\stext"\s\s\sat\s<anonymous>\s\(/gi );
                expect( meta ).to.deep.equal({ data: 'some metadata' });
                done();
            });
            logger.debug( 'message text', { data: 'some metadata' });
        });
    });

    describe( '/development', function() {
        it( 'should simulate production on development', function( done ) {
            const logger = require( '../src' ).configure({ id: Math.random(), transport: 'development' });
            logger.on( 'logging', ( transport, level, msg, meta ) => {
                expect( transport ).to.have.property( 'name' ).and.equal( 'console' );
                expect( level ).to.equal( 'info' );
                expect( msg ).to.equal( 'message text' );
                expect( meta ).to.deep.equal({ data: 'some metadata' });
                done();
            });
            logger.debug( 'hidden', { data: 'hidden' });
            logger.info( 'message text', { data: 'some metadata' });
        });
    });

    describe( '/production', function() {
        process.env.DOCKERCLOUD_SERVICE_HOSTNAME = 'testService';
        process.env.DOCKERCLOUD_CONTAINER_HOSTNAME = 'testHost';
        process.env.DOCKERCLOUD_NODE_HOSTNAME = 'testNodeHost';
        process.env.DOCKERCLOUD_STACK_NAME = 'test-stack-name';

        it( 'should log crits to all three transports', function( done ) {
            const logger = require( '../src' ).configure( R.merge({ id: Math.random(), transport: 'production' }, config ));
            logger.transports.Papertrail.on( 'connect', () => {
                let count = 0;
                logger.on( 'logging', ( transport, level, msg ) => {
                    expect( msg ).to.equal( 'testing critical messages' );
                    count++;
                    if ( count > 2 ) {
                        done();
                    }
                });
                logger.crit( 'testing critical messages' );
            });
        });

        it( 'should not log debugs to standardSlack', function() {
            const logger = require( '../src' ).configure( R.merge({ id: Math.random(), transport: 'production' }, config ));
            logger.debug( 'testing debug messages' );
        });

        it( 'should log info to Papertrail and file', function( done ) {
            const logger = require( '../src' ).configure( R.merge({ id: Math.random(), transport: 'production' }, config ));
            logger.transports.Papertrail.on( 'connect', () => {
                let count = 0;
                logger.on( 'logging', ( transport, level, msg ) => {
                    expect( transport ).to.have.property( 'name' ).and.match( /Papertrail|file/g );
                    expect( msg ).to.equal( 'testing info messages' );
                    count++;
                    if ( count > 1 ) {
                        done();
                    }
                });
                logger.info( 'testing info messages' );
            });
        });
    });

    describe( '/test', function() {
        it( 'should not crit anything', function( done ) {
            const logger = require( '../src' ).configure({ id: Math.random(), transport: 'test' });
            const spy = sinon.spy();
            logger.on( 'logging', spy );
            logger.crit( 'should crit verbose message and standard meta' );
            setTimeout(() => {
                expect( spy ).to.not.have.been.called;
                done();
            }, 10 );
        });

        it( 'should console log message on emergency', function( done ) {
            const logger = require( '../src' ).configure({ id: Math.random(), transport: 'test' });
            logger.on( 'logging', ( transport, level, msg, meta ) => {
                expect( transport ).to.have.property( 'name' ).and.equal( 'console' );
                expect( level ).to.equal( 'emerg' );
                expect( msg ).to.equal( 'message text' );
                expect( meta ).to.deep.equal({ data: 'some metadata' });
                done();
            });
            logger.emerg( 'message text', { data: 'some metadata' });
        });
    });

    describe( 'middleware', function() {
        it( 'should console log requests', function( done ) {
            const logger = require( '../src' ).configure({ id: Math.random(), transport: 'debug' });
            const middleware = logger.middleware;
            logger.on( 'logging', ( transport, level, msg ) => {
                expect( transport ).to.have.property( 'name' ).and.equal( 'console' );
                expect( level ).to.equal( 'info' );
                expect( msg.substr( 0, 37 )).to.match( /GET\s\/\s/g );
                done();
            });
            request( http.createServer(( req, res ) => {
                middleware( req, res, err => {
                    if ( err ) {
                        res.statusCode = 500;
                        res.end( err.message );
                    }

                    res.setHeader( 'X-Sent', 'true' );
                    res.end(( req.connection && req.connection.remoteAddress ) || '-' );
                });
            }))
            .get( '/' )
            .expect( 200, () => {});
        });
    });

    describe( 'environment variables', function() {
        process.env.NODE_ENV = 'test';

        it( 'should not info anything', function() {
            const logger = require( '../src' ).configure({ id: Math.random() });
            logger.info( 'should not info anything' );
        });

        it( 'should not error anything', function() {
            const logger = require( '../src' ).configure({ id: Math.random() });
            logger.info( 'should not error anything' );
        });

        it( 'should crit verbose message and standard meta', function() {
            const logger = require( '../src' ).configure({ id: Math.random() });
            logger.crit( 'should crit verbose message and standard meta' );
        });
    });
});
