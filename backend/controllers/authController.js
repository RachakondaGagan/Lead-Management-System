import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret_leadgen2026', {
        expiresIn: '30d',
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Please add all fields' });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        if (user) {
            res.status(201).json({
                success: true,
                data: {
                    _id: user.id,
                    name: user.name,
                    email: user.email,
                    token: generateToken(user._id),
                }
            });
        } else {
            res.status(400).json({ success: false, error: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Register Error: ", error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// @desc    Login a user
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for user email
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                success: true,
                data: {
                    _id: user.id,
                    name: user.name,
                    email: user.email,
                    token: generateToken(user._id),
                }
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error("Login Error: ", error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// @desc    Get current user data
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            data: req.user
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
