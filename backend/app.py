import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import numpy as np

app = Flask(__name__)
CORS(app)

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request."}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected for uploading."}), 400
        
    if not file.filename.endswith('.csv'):
        return jsonify({"error": "Invalid file type. Only CSV files are accepted."}), 400

    try:
        # 1. Read CSV
        df = pd.read_csv(file)
        
        # 2. Check required columns
        required_cols = ['CustomerID', 'InvoiceDate', 'Amount']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({"error": f"Missing required columns: {', '.join(missing_cols)}"}), 400
            
        # 3. Drop missing values
        df = df.dropna(subset=required_cols)
        
        if df.empty:
            return jsonify({"error": "Dataset is empty after dropping missing values."}), 400
            
        # 4. Convert dates
        df['InvoiceDate'] = pd.to_datetime(df['InvoiceDate'])
        
        # 5. Calculate RFM
        snapshot_date = df['InvoiceDate'].max() + pd.Timedelta(days=1)
        
        rfm = df.groupby('CustomerID').agg({
            'InvoiceDate': lambda x: (snapshot_date - x.max()).days,
            'CustomerID': 'count',
            'Amount': 'sum'
        })
        
        rfm.rename(columns={
            'InvoiceDate': 'Recency',
            'CustomerID': 'Frequency',
            'Amount': 'Monetary'
        }, inplace=True)
        
        # Filter out negative monetary values if any
        rfm = rfm[rfm['Monetary'] > 0]
        
        if len(rfm) < 3:
            return jsonify({"error": "Not enough unique customers to perform clustering (minimum 3 required)."}), 400

        # 6. Standardize RFM values
        scaler = StandardScaler()
        rfm_scaled = scaler.fit_transform(rfm[['Recency', 'Frequency', 'Monetary']])
        
        # 7. Apply K-Means (k = 3)
        kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
        kmeans.fit(rfm_scaled)
        
        rfm['Cluster'] = kmeans.labels_
        
        # 8. Assign labels consistently (High, Medium, Low)
        # We can sort the cluster centers by Monetary value to assign labels
        # Higher monetary value generally means higher value customer
        cluster_centers = pd.DataFrame(scaler.inverse_transform(kmeans.cluster_centers_), columns=['Recency', 'Frequency', 'Monetary'])
        cluster_centers['Cluster'] = cluster_centers.index
        
        # Sort by Monetary value descending
        sorted_clusters = cluster_centers.sort_values(by='Monetary', ascending=False)
        
        labels_map = {
            sorted_clusters.iloc[0]['Cluster']: "High Value",
            sorted_clusters.iloc[1]['Cluster']: "Medium Value",
            sorted_clusters.iloc[2]['Cluster']: "Low Value"
        }
        
        rfm['Segment'] = rfm['Cluster'].map(labels_map)
        
        # 9. Format response
        clusters_list = rfm.reset_index()[['CustomerID', 'Segment', 'Recency', 'Frequency', 'Monetary']].to_dict(orient='records')
        
        summary = rfm['Segment'].value_counts().to_dict()
        # Ensure all keys exist
        for key in ["High Value", "Medium Value", "Low Value"]:
            if key not in summary:
                summary[key] = 0
                
        chart_data = {
            "labels": ["High Value", "Medium Value", "Low Value"],
            "values": [summary["High Value"], summary["Medium Value"], summary["Low Value"]]
        }
        
        response_data = {
            "clusters": clusters_list,
            "summary": summary,
            "chart_data": chart_data
        }
        
        return jsonify(response_data), 200

    except Exception as e:
        return jsonify({"error": f"Error processing file: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
