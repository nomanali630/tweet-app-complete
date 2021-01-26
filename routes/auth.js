
var express = require("express");
var bcrypt = require("bcrypt-inzi");
var jwt = require('jsonwebtoken');
var postmark = require("postmark");
var { SERVER_SECRET } = require("../core/index");

var API_TOKEN = process.env.API_TOKEN 
var client = new postmark.Client(API_TOKEN);

var { userModel, otpModel   } = require("../dbrepo/models");
console.log("userModel: ", userModel);

var api = express.Router();

api.post("/signup", (req, res, next) => {

    if (!req.body.name
        || !req.body.email
        || !req.body.password
        || !req.body.phone
        || !req.body.gender) {

        res.status(403).send(`
            please send name, email, passwod, phone and gender in json body.
            e.g:
            {
                "name": "Noman ali",
                "email": "Noman@gmail.com",
                "password": "123",
                "phone": "03001234567",
                "gender": "Male"
            }`)
        return;
    }

    userModel.findOne({ email: req.body.email },
        function (err, doc) {
            if (!err && !doc) {

                bcrypt.stringToHash(req.body.password).then(function (hash) {

                    var newUser = new userModel({
                        "name": req.body.name,
                        "email": req.body.email,
                        "password": hash,
                        "phone": req.body.phone,
                        "gender": req.body.gender,
                    })
                    newUser.save((err, data) => {
                        if (!err) {
                            res.send({
                                status: 200,
                                message: "user created"
                            })
                        } else {
                            console.log(err);
                            res.status(500).send({
                                message: "user create error, " + err
                            })
                        }
                    });
                })

            } else if (err) {
                res.status(500).send({
                    message: "db error"
                })
            } else {
                res.send({
                    message: "user already exist"
                })
            }
        })

});

api.post("/login", (req, res, next) => {

    if (!req.body.email || !req.body.password) {

        res.status(403).send(`
            please send email and passwod in json body.
            e.g:
            {
                "email": "Noman ali",
                "password": "123",
            }`)
        return;
    }

    userModel.findOne({ email: req.body.email },
        function (err, user) {
            if (err) {
                res.status(500).send({
                    message: "an error occured: " + JSON.stringify(err)
                });
            } else if (user) {

                bcrypt.varifyHash(req.body.password, user.password).then(isMatched => {
                    if (isMatched) {
                        console.log("matched");
                        var token =
                            jwt.sign({
                                id: user._id,
                                name: user.name,
                                email: user.email,
                            }, SERVER_SECRET)
                        res.cookie('jToken', token, {
                            maxAge: 86_400_000,
                            httpOnly: true
                        });

                        res.send({
                            status: 200,
                            message: "login success",
                            user: {
                                name: user.name,
                                email: user.email,
                                phone: user.phone,
                                gender: user.gender,
                            }
                        });

                    } else {
                        console.log("not matched");
                        res.send({
                            message: "incorrect password"
                        })
                    }
                }).catch(e => {
                    console.log("error: ", e)
                })

            } else {
                res.status(403).send({
                    message: "user not found"
                });
            }
        });
});

api.post("/logout", (req, res, next) => {
    res.cookie('jToken', "", {
        maxAge: 86_400_000,
        httpOnly: true
    });
    res.send("logout success");
});

api.post("/forget_password", function (req, res, next) {
    if (!req.body.email) {
        res.status(403).send(`
            please send body in json body
        {
            "email":"noman@gmail.com"
        }`)
        return;
    }
    userModel.findOne({ email: req.body.email },
        function (err, user) {
            if (err) {
                res.status(500).send({
                    message: "an error occured: " + JSON.stringify(err)
                });
            } else if (user) {
                const otp = Math.floor(getRandomArbitrary(111111, 99999));

                otpModel.create({
                    email: req.body.email,
                    otpCode: otp
                }).then((doc) => {
                    client.sendEmail({
                        "From": "noman_student@sysborg.com",
                        "To": req.body.email,
                        "Subject": "Reset Your Password",
                        "Textbody": `Here is your Reset password code : ${otp}`
                    }).then((status) => {
                        console.log("status: ", status);
                        res.send({
                            status: 200,
                            message: "email sent with code"
                        })
                    })
                }).catch((err) => {
                    console.log("error in creating otp:", err)
                    res.status(500).send("an unexpected error occured")
                })
            } else {
                res.status(403).send({
                    message: "user not found"
                });
            }
        }
    )
});

api.post("/forget_password_step_2", function (req, res, next) {

    if (!req.body.email || !req.body.newPass || !req.body.otp) {
        res.status(403).send({
            message: "please pprovide email"
        })
    }

    userModel.findOne({ email: req.body.email }, (err, user) => {
        if (err) {
            res.status(500).send({
                message: "Something went wrong"
            })
        } else if (user) {
            otpModel.find({ email: req.body.email }, (err, otpData) => {
                if (err) {
                    res.status(500).send({
                        message: "Something went wrong"
                    })
                } else if (otpData) {
                    console.log("this is database otp data=>" , otpData);
                    console.log("this is otp from request => " , req.body.otp);
                    otpData = otpData[otpData.length - 1]
                    const nowDate = new Date().getTime();
                    const otpIat = new Date(otpData.createdOn).getTime();
                    const diff = nowDate - otpIat;
                    
                    if (otpData.otpCode == req.body.otp && diff < 300000) {
                        otpData.remove();
                        bcrypt.stringToHash(req.body.newPass).then(function (hash) {
                            user.update({ password: hash }, {}, function (err, data) {
                                res.send({
                                    status: 200,
                                    message: "Password updated"
                                });
                            })
                        })
                    } else {
                        res.send({
                            message: "incorrect otp"
                        });
                    }
                } else {
                    res.send({
                        message: "incorrect otp"
                    });
                }
            })
        } else {
            res.send({
                message: "User Not Found"
            })
        }
    })
});


module.exports = api;




function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
} 
