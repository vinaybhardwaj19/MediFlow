import flwr as fl
import sys

def main():
    strategy = fl.server.strategy.FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=3,
        min_evaluate_clients=3,
        min_available_clients=3,
    )
    print("Starting Flower Federated Learning Server (FedAvg)")
    fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=fl.server.ServerConfig(num_rounds=12),
        strategy=strategy,
    )

if __name__ == "__main__":
    main()
