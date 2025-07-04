const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
const moment = require('moment-timezone');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Task Schema
const taskSchema = new mongoose.Schema({
  title: String,
  description: String,
  dueDate: Date,
  email: String,
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
});
const Task = mongoose.model('Task', taskSchema);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify SMTP connection
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});

// Hàm kiểm tra email hợp lệ
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// API to create a task
app.post('/api/tasks', async (req, res) => {
  const { title, description, dueDate, email, timezone } = req.body;
  try {
    if (!title || !description || !dueDate || !email) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các trường' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }
    const validTimezone = timezone && moment.tz.zone(timezone) ? timezone : 'Asia/Ho_Chi_Minh';
    const validDueDate = moment(dueDate).isValid() ? new Date(dueDate) : new Date();
    const task = new Task({ title, description, dueDate: validDueDate, email, timezone: validTimezone });
    await task.save();
    console.log(`Task created: ${title}, Due: ${moment(validDueDate).toISOString()}, Timezone: ${validTimezone}`);
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// API to get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// API to update a task
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, dueDate, email, timezone } = req.body;
  try {
    if (!title || !description || !dueDate || !email) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các trường' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }
    const validTimezone = timezone && moment.tz.zone(timezone) ? timezone : 'Asia/Ho_Chi_Minh';
    const validDueDate = moment(dueDate).isValid() ? new Date(dueDate) : new Date();
    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { title, description, dueDate: validDueDate, email, timezone: validTimezone },
      { new: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    console.log(`Task updated: ${title}, Due: ${moment(validDueDate).toISOString()}, Timezone: ${validTimezone}`);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// API to delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    console.log(`Task deleted: ${deletedTask.title}`);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Schedule email reminders (runs every minute)
cron.schedule('*/10 * * * *', async () => {
  console.log('Cron job running at:', new Date().toLocaleString('en-US', { timeZone: 'UTC' }));
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  try {
    const tasks = await Task.find({
      dueDate: { $gte: now, $lte: in24Hours },
    });
    console.log(`Tasks due within 24 hours (UTC): ${tasks.length}`);
    for (const task of tasks) {
      if (!isValidEmail(task.email)) {
        console.log(`Invalid email for task: ${task.title}`);
        continue;
      }
      const userTimezone = task.timezone || 'Asia/Ho_Chi_Minh';
      const formattedDueDate = moment(task.dueDate)
        .tz(userTimezone)
        .format('YYYY-MM-DD HH:mm:ss');
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: task.email,
        subject: `Nhắc nhở: Công việc "${task.title}" sắp đến hạn!`,
        text: `Công việc "${task.title}" sẽ hết hạn vào ${formattedDueDate}. Mô tả: ${task.description}`,
      });
      console.log(`Reminder sent for task: ${task.title}, Due: ${formattedDueDate}, Email: ${task.email}`);
    }
  } catch (error) {
    console.error('Error sending reminders:', error);
  }
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST;
app.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));