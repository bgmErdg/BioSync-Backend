import os
from datetime import date, datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'biosync-secret-key-123'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///biosync.db'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)
    profile_pic = db.Column(db.String(150), default='') 

class DailyRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    record_date = db.Column(db.Date, nullable=False, default=date.today)
    dominant_activity = db.Column(db.String(50))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def home():
    if current_user.is_authenticated: 
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.password == password:
            login_user(user)
            return redirect(url_for('dashboard'))
        flash('Invalid username or password.', 'error')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if User.query.filter_by(username=username).first():
            flash('Username already exists.', 'error')
        else:
            new_user = User(username=username, password=password)
            db.session.add(new_user)
            db.session.commit()
            login_user(new_user)
            return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('index.html', current_user=current_user)

@app.route('/analytics')
@login_required
def analytics():
    return render_template('analytics.html', current_user=current_user)

# --- İŞTE EKSİK OLAN LOGOUT KISMI ---
@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))
# ------------------------------------

@app.route('/api/heatmap')
@login_required
def get_heatmap_data():
    records = DailyRecord.query.filter_by(user_id=current_user.id).all()
    data = {rec.record_date.strftime('%Y-%m-%d'): rec.dominant_activity for rec in records}
    return jsonify(data)

@app.route('/upload_avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'file' not in request.files: 
        return jsonify({"success": False, "error": "No file found"})
    file = request.files['file']
    if file.filename == '': 
        return jsonify({"success": False, "error": "No file selected"})
    if file:
        filename = secure_filename(f"user_{current_user.id}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        current_user.profile_pic = filename
        db.session.commit()
        return jsonify({"success": True, "filename": filename})

@app.route("/save", methods=["POST"])
@login_required
def save_record():
    data = request.json
    sleep = float(data.get("sleep", 0))
    work = float(data.get("work", 0))
    social = float(data.get("social", 0))
    labor = float(data.get("labor", 0))
    date_str = data.get("date")

    try:
        record_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else date.today()
    except:
        record_date = date.today()

    activities = {'sleep': sleep, 'work': work, 'social': social, 'labor': labor}
    dominant = max(activities, key=activities.get)
    if activities[dominant] == 0: dominant = "none"

    record = DailyRecord.query.filter_by(user_id=current_user.id, record_date=record_date).first()
    if not record:
        record = DailyRecord(user_id=current_user.id, record_date=record_date, dominant_activity=dominant)
        db.session.add(record)
    else:
        record.dominant_activity = dominant
    db.session.commit()

    return jsonify({"success": True, "message": f"Data for {record_date} saved successfully! 💾"})

@app.route("/calculate", methods=["POST"])
@login_required
def calculate():
    data = request.json
    mode = data.get("mode", "standard")
    sleep = float(data.get("sleep", 0))
    work = float(data.get("work", 0))
    social = float(data.get("social", 0))
    labor = float(data.get("labor", 0))

    state = "healthy"
    message = f"System Synced: {mode.upper()} mode active. ✨"

    if sleep > 10: return jsonify({"state": "tired", "message": "⚠️ SYSTEM WARNING: Sleep > 10h. Oversleeping detected!"})
    if mode == "discipline":
        if sleep < 7: state, message = "tired", "⚠️ CRITICAL: Sleep must be at least 7 hours for deep focus."
        elif social > 3: state, message = "distracted", "🚨 FOCUS: Socializing exceeds 3 hours. Return to your tasks!"
        elif labor > 4: state, message = "distracted", "🚨 FOCUS: Labor/Chores exceed 4 hours. Stop procrastinating!"  
    elif mode == "holiday":
        if work > 2: state, message = "burnout", "🏝️ WARNING: You need to rest! Stop working immediately."
    elif mode == "standard":
        if sleep < 7: state, message = "tired", "⚠️ WARNING: Sleep deprivation detected."
        elif work > 10: state, message = "burnout", "🔥 WARNING: Overwork detected. Risk of burnout."
        elif social < 2: state, message = "lonely", "🌧️ ISOLATION: Social interaction is too low."

    return jsonify({"state": state, "message": message})

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)